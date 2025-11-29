#!/usr/bin/env bash
set -euo pipefail

# create-ftp-user.sh - Universal FTP user creation script
# Usage: ./create-ftp-user.sh <username> <folder_path> [password]
# Example: ./create-ftp-user.sh thenewway /data/web-wp/the-new-way mypassword123

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <username> <folder_path> [password]"
    echo ""
    echo "Examples:"
    echo "  $0 thenewway /data/web-wp/the-new-way"
    echo "  $0 client1 /data/client1-site custom_password"
    echo "  $0 user2 /data/another-project"
    echo ""
    exit 1
fi

USERNAME="$1"
FOLDER_PATH="$2"
PASSWORD="${3:-}"

# Validate username (alphanumeric + underscore only)
if [[ ! "$USERNAME" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "Error: Username can only contain letters, numbers, and underscores"
    exit 1
fi

# Generate password if not provided
if [ -z "$PASSWORD" ]; then
    PASSWORD=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-12)
    echo "Generated password: $PASSWORD"
fi

echo "Creating FTP user: $USERNAME"
echo "Folder: $FOLDER_PATH"
echo "Password: $PASSWORD"
echo ""

# Check if user already exists
if id "$USERNAME" &>/dev/null; then
    echo "Warning: User '$USERNAME' already exists. Skipping user creation."
else
    echo "Creating user with restricted shell..."
    useradd -m -d "$FOLDER_PATH" -s /bin/false "$USERNAME"
    
    echo "Setting password..."
    echo "$USERNAME:$PASSWORD" | chpasswd
fi

echo "Creating and setting folder permissions..."
mkdir -p "$FOLDER_PATH"
chown "$USERNAME:$USERNAME" "$FOLDER_PATH"
chmod 755 "$FOLDER_PATH"

echo ""
echo "✅ FTP user '$USERNAME' created successfully!"
echo ""
echo "Connection details:"
echo "  Username: $USERNAME"
echo "  Password: $PASSWORD"
echo "  Directory: $FOLDER_PATH"
echo ""
echo "Note: User has shell access disabled (/bin/false) for security."
echo ""
echo "To connect via FTP, use these credentials with your FTP client."