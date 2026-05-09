# Minecraft Allowlisting

A minimal Node.js Express server that asks for a user minecraft username and a pre-shared secret key. If the username and key are correct, the server will add the user to the allowlist of a Minecraft server using RCON at the $RCON_SERVER environment variable which should be in the format `host:port`.
