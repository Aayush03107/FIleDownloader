import { createClient } from "redis";
export const client = createClient();

client.on('error', err => console.log('error'));
await client.connect();
console.log('connected');

