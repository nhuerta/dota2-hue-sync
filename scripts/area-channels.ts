/**
 * Shows, and with --apply sets, the entertainment channels of the configured area.
 *
 * The bridge derives channels from the positions of each light in the area (at most two per
 * light, coordinates within -1..1). One position collapses a gradient strip into a single
 * channel; a start and an end position split it by segment spacing. For the Hue gradient
 * lightstrip (LCX004, 7 segments) that gives 3 channels, the same layout the Hue app uses;
 * stretching the strip across the cube's diagonal gives 4, and nothing gives 7. Seven channels
 * exist only for the Play gradient lightstrip (LCX001).
 *
 *   bun run scripts/area-channels.ts            # show the channels
 *   bun run scripts/area-channels.ts --apply    # place the strip from x=-1 to x=1, then show
 *
 * Reads HUE_BRIDGE_IP, HUE_USERNAME and HUE_GROUP_ID from the environment (.env). Changes the
 * bridge only with --apply; the change is undone by applying a single position again.
 */
import { APP_CONFIG } from '../src/config/app-config';

const bridgeIp = process.env.HUE_BRIDGE_IP ?? '';
const username = process.env.HUE_USERNAME ?? '';
const { groupId } = APP_CONFIG;
if (!bridgeIp || !username) {
  console.error('HUE_BRIDGE_IP and HUE_USERNAME must be set');
  process.exit(1);
}
const apply = process.argv.includes('--apply');

interface Channel { channel_id: number; position: { x: number; y: number; z: number }; members: { service: { rid: string }; index: number }[] }
interface ServiceLocation { service: { rtype: string; rid: string }; positions: { x: number; y: number; z: number }[]; position?: unknown; equalization_factor?: number }
interface Area { id: string; id_v1?: string; metadata: { name: string }; channels: Channel[]; locations: { service_locations: ServiceLocation[] } }

async function clip(method: string, path: string, body?: unknown): Promise<{ errors: { description: string }[]; data: Area[] }> {
  const response = await fetch(`https://${bridgeIp}/clip/v2/resource/${path}`, {
    method,
    headers: { 'hue-application-key': username, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    tls: { rejectUnauthorized: false }
  } as RequestInit);
  return response.json() as Promise<{ errors: { description: string }[]; data: Area[] }>;
}

function describe(area: Area): void {
  console.log(`${area.metadata.name} (${area.id}, v1 ${area.id_v1}): ${area.channels.length} channel(s)`);
  for (const channel of area.channels) {
    const members = channel.members.map(m => m.index).join(',');
    console.log(`  channel ${channel.channel_id} x=${channel.position.x.toFixed(2)} segments [${members}]`);
  }
}

const areas = (await clip('GET', 'entertainment_configuration')).data;
const area = areas.find(a => a.id === groupId || a.id_v1 === `/groups/${groupId}` || a.metadata.name === groupId);
if (!area) {
  console.error(`No entertainment area matches HUE_GROUP_ID=${groupId}. Available: ${areas.map(a => `${a.metadata.name} (${a.id_v1})`).join(', ')}`);
  process.exit(1);
}
describe(area);

if (apply) {
  const y = area.channels[0]?.position.y ?? 0;
  const service_locations = area.locations.service_locations.map(location => ({
    service: location.service,
    positions: [{ x: -1, y, z: 0 }, { x: 1, y, z: 0 }]
  }));
  const result = await clip('PUT', `entertainment_configuration/${area.id}`, { locations: { service_locations } });
  if (result.errors.length > 0) {
    console.error('Bridge rejected the update:', result.errors.map(e => e.description).join('; '));
    process.exit(1);
  }
  console.log('Updated. Now:');
  const updated = (await clip('GET', `entertainment_configuration/${area.id}`)).data[0];
  describe(updated ?? area);
}
