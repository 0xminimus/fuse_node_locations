# Fuse nodes geographic location

A small script to fetch geographic information about Fuse Network nodes.

# Install

```
npm install
```

Register on ipinfo.io, copy `secrets.js.template` into `secrets.js` and fill it in with your API access token.

# Usage

You  must first provide a initial set of peer nodes, which you can fetch from your nodes with:

```
curl --data '{"method":"parity_netPeers","params":[],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST localhost:8545 > input/initial_peers.json
```

Then run:

```
npm start
```
