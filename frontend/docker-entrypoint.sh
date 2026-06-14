#!/bin/sh

# Generate env-config.js from template with environment variables
envsubst < /tmp/env-config.template.js > /usr/share/nginx/html/env-config.js

echo "🔧 Generated env-config.js with runtime environment variables:"
cat /usr/share/nginx/html/env-config.js

# Start nginx
exec nginx -g "daemon off;"