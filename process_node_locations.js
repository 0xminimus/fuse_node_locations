const fs = require('fs');
const axios = require('axios');

const { IPINFO_TOKEN } = require('./secrets');
let { IPinfoWrapper } = require("node-ipinfo");
let ipinfo = new IPinfoWrapper(IPINFO_TOKEN);

const INITIAL_PEERS = './input/initial_peers.json';
const GEOLOCATION_FILE = './output/geo_results.json';
// https://github.com/datasets/geo-countries/blob/master/data/countries.geojson
const WORLD_GEOSON_FILE = './input/countries.geojson.json';
const NODES_GEOSON_FILE = './output/nodes.geojson';

// process the json returned from OpenEthereum/Parity node for peer list call
const process_peers = (peers) => {
  let ips = [];
  //console.log('peers length', peers.length)
  for (const peer of peers) {
    //console.log(peer)
    if(!peer.network
       || !peer.network.remoteAddress
       || peer.network.remoteAddress == "Handshake"
       || peer.network.remoteAddress == ""
       || !peer.protocols.pip
      )
    {
      //console.log(`Skipping peer ${peer.id}`);
      continue;
    }

    // strip port from IP if present
    //console.log(peer.network.remoteAddress)
    const port_position = peer.network.remoteAddress.indexOf(':');
    const address = port_position > 0 ? peer.network.remoteAddress.substr(0, port_position) : peer.network.remoteAddress;
    //console.log('address', address)
    ips.push(address);
  }

  //console.log('process peers ips length', ips.length)
  return ips;
};

// Connect to validator and ask for its peers
const get_peer_ips = async (ip) => {
  try{
    //console.log(ip)
    // curl --data '{"method":"parity_netPeers","params":[],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST host:8545
    const response = await axios({
      method: 'post',
      url: `http://${ip}:8545`,
      data: {
        method: "parity_netPeers",
        params: [],
        id: 1,
        jsonrpc: "2.0"
      },
      timeout: 1000,
    });
    //console.log(response.data.result)
    const peers_data = response.data.result.peers;
    return process_peers(peers_data);
  } catch(axiosErr){
    console.log('Error fetching more peers', axiosErr.code);
    //console.log(axiosErr)
  }

  return [];
};

// get an array of all validator IPs
const get_ips = async () => {
  // process initial set from own node
  const initial_peers = require(INITIAL_PEERS).result.peers;
  const initial_ips = process_peers(initial_peers);

  // for each peer of our own node, try to get its peers, to end up with a complete set
  let final_ips = initial_ips;
  for (const ip of initial_ips) {
    const new_ips = await get_peer_ips(ip);
    //console.log('new_ips: ', new_ips.length)
    final_ips = final_ips.concat(new_ips);
  }
  //console.log('final_ips: ', final_ips.length)

  return [...new Set([...final_ips])];
};

const writeData = (jsonData, file) => {
  const data = JSON.stringify(jsonData);
  try {
    fs.writeFileSync(file, data);
    console.log(`JSON data is saved to ${file}.`);
  } catch (error) {
    console.error(error);
  }
};

// Fetch geographic info from ipinfo.io
const fetch_ipinfo = async (ips) => {
  let geolocation = [];
  try {
    geolocation = require(GEOLOCATION_FILE);
  } catch (error) {
    console.log('Fetching from ipinfo');
    for (const ip of ips) {
      const response = await ipinfo.lookupIp(ip);
      //console.log(response)
      geolocation.push({
        ip: response.ip,
        country: response.country,
        countryCode: response.countryCode,
        org: response.org,
      });
    }
    //console.log(geolocation)

    writeData(geolocation, GEOLOCATION_FILE);
  }

  return geolocation;
};

// Get aggregated amount per country
const compute_countries = (geolocation) => {
  // countries
  let countries = [];
  let countryCodes = [];
  geolocation.map(n => {
    if (countries[n.country]) {
      countries[n.country]++;
      countryCodes[n.countryCode]++;
    } else {
      countries[n.country] = 1;
      countryCodes[n.countryCode] = 1;
    }
  });
  console.log(countries);
  console.log(countryCodes);

  return { countries, countryCodes };
};

// Get aggregated amount per ASN
const compute_asns = (geolocation) => {
  // asns
  let asns = [];
  geolocation.map(n => {
    if (asns[n.org]) asns[n.org]++;
    else asns[n.org] = 1;
  });
  console.log(asns);
};

// Create GeoJSON file to be used with Mapbox
const create_geoson = (countryCodes) => {
  const world_geoson = require(WORLD_GEOSON_FILE);
  //console.log(world_geoson.features.slice(0, 3))
  const node_countries_features = world_geoson.features.filter(c => countryCodes[c.properties.ISO_A2] > 0);
  //console.log(world_countries)
  node_countries_features.map((c, i) => node_countries_features[i].properties.nodes = countryCodes[c.properties.ISO_A2]);
  world_geoson.features = node_countries_features;
  writeData(world_geoson, NODES_GEOSON_FILE);
};

(async function main() {
  const ips = await get_ips();
  console.log('ips: ', ips.length);
  const geolocation = await fetch_ipinfo(ips);
  //console.log(geolocation)
  const { countryCodes } = compute_countries(geolocation);
  compute_asns(geolocation);
  create_geoson(countryCodes);
})();
