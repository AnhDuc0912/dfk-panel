const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const { ROOT_DIR } = require('../lib/fs-utils');

const router = express.Router();

// FTP configuration from environment variables
const FTP_USE_SUDO = ('' + (process.env.FTP_USE_SUDO || 'true')).toLowerCase() === 'true';
const FTP_USER_HOME_BASE = process.env.FTP_USER_HOME_BASE || '/home';

function maybeSudo(cmd) {
  return FTP_USE_SUDO ? ('sudo ' + cmd) : cmd;
}

// Generate random password
function generatePassword(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// List FTP users page
router.get('/ftp', (req, res) => {
  // Get list of FTP users by checking /etc/passwd for users with specific shell or home dir pattern
  const listCmd = "getent passwd | grep -E '(/bin/false|/usr/sbin/nologin|ftp)' | cut -d: -f1,3,5,6";
  
  exec(listCmd, { timeout: 10_000 }, (err, stdout, stderr) => {
    const users = [];
    if (!err && stdout) {
      const lines = stdout.trim().split('\n').filter(line => line.length > 0);
      lines.forEach(line => {
        const [username, uid, comment, home] = line.split(':');
        // Filter to show only users that look like FTP users (UID > 1000, specific home path pattern)
        if (parseInt(uid) >= 1000 && (home.includes('/home/') || home.includes('/var/ftp/'))) {
          users.push({ username, uid, comment, home });
        }
      });
    }
    
    res.render('ftp', { 
      users,
      error: err ? `Error listing users: ${err.message}` : null,
      rootDir: ROOT_DIR,
      ftpUserHomeBase: FTP_USER_HOME_BASE
    });
  });
});

// Create FTP user
router.post('/ftp/create-user', (req, res) => {
  const { username, folder_path, password_type, custom_password } = req.body;
  
  if (!username || !folder_path) {
    return res.status(400).send('Username and folder path are required');
  }
  
  // Validate username (alphanumeric + underscore only)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).send('Username can only contain letters, numbers, and underscores');
  }
  
  // Generate or use custom password
  const password = password_type === 'custom' && custom_password ? custom_password : generatePassword();
  
  // Resolve folder path
  const fullFolderPath = path.resolve(folder_path);
  
  // Create the user with restricted shell and specified home directory
  const createUserCmd = maybeSudo(`useradd -m -d "${fullFolderPath}" -s /bin/false "${username}"`);
  
  exec(createUserCmd, { timeout: 15_000 }, (createErr, createOut, createErrOut) => {
    if (createErr) {
      return res.status(500).send(`Failed to create user: ${createErr.message}\n${createErrOut || ''}`);
    }
    
    // Set password
    const setPasswordCmd = maybeSudo(`bash -c 'echo "${username}:${password}" | chpasswd'`);
    
    exec(setPasswordCmd, { timeout: 10_000 }, (passErr, passOut, passErrOut) => {
      if (passErr) {
        // User created but password failed - try to clean up
        const deleteCmd = maybeSudo(`userdel -r "${username}"`);
        exec(deleteCmd, { timeout: 10_000 }, () => {
          res.status(500).send(`User created but password setting failed: ${passErr.message}\n${passErrOut || ''}`);
        });
        return;
      }
      
      // Ensure the folder exists and set proper ownership
      const ensureFolderCmd = maybeSudo(`mkdir -p "${fullFolderPath}" && chown ${username}:${username} "${fullFolderPath}" && chmod 755 "${fullFolderPath}"`);
      
      exec(ensureFolderCmd, { timeout: 10_000 }, (folderErr, folderOut, folderErrOut) => {
        if (folderErr) {
          console.warn(`Folder setup warning: ${folderErr.message}`);
        }
        
        // Success response
        const message = [
          `FTP user created successfully!`,
          ``,
          `Username: ${username}`,
          `Password: ${password}`,
          `Home Directory: ${fullFolderPath}`,
          ``,
          `The user can now connect via FTP to access the specified folder.`,
          `Note: User has shell access disabled (/bin/false) for security.`
        ].join('\n');
        
        res.send(message);
      });
    });
  });
});

// Delete FTP user
router.post('/ftp/delete-user', (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).send('Username is required');
  }
  
  // Validate username
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).send('Invalid username');
  }
  
  const deleteCmd = maybeSudo(`userdel -r "${username}"`);
  
  exec(deleteCmd, { timeout: 15_000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).send(`Failed to delete user: ${err.message}\n${stderr || ''}`);
    }
    
    res.send(`User '${username}' deleted successfully.`);
  });
});

// Change password
router.post('/ftp/change-password', (req, res) => {
  const { username, new_password } = req.body;
  
  if (!username || !new_password) {
    return res.status(400).send('Username and new password are required');
  }
  
  // Validate username
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).send('Invalid username');
  }
  
  const setPasswordCmd = maybeSudo(`bash -c 'echo "${username}:${new_password}" | chpasswd'`);
  
  exec(setPasswordCmd, { timeout: 10_000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).send(`Failed to change password: ${err.message}\n${stderr || ''}`);
    }
    
    res.send(`Password changed successfully for user '${username}'.`);
  });
});

module.exports = router;