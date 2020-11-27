# Send

A file sharing experiment which allows you to send encrypted files to other users.

Based on Firefox Send, with optimization and simplification

Deployment: https://neko.nz/

# Development

To start an ephemeral development server, run:

```shell
cd client
npm install
npx webpack

cd server
go run .
```

Then, browse to http://localhost:32147
