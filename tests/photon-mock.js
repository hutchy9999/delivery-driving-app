// Stands in for photon.komoot.io in tests, with realistic Manchester results.
const feature = (name, props, lon, lat) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name, osm_type: 'N', countrycode: 'GB', city: 'Manchester', ...props },
});

const VENUES = [
  feature("Nando's", { osm_id: 101, osm_key: 'amenity', osm_value: 'restaurant', housenumber: '61', street: 'Piccadilly', district: 'Northern Quarter', postcode: 'M1 2AQ' }, -2.2338, 53.4815),
  feature("Nando's", { osm_id: 102, osm_key: 'amenity', osm_value: 'restaurant', street: 'Great Ancoats Street', district: 'Ancoats', postcode: 'M4 5AB' }, -2.2251, 53.4832),
  feature("Nando's", { osm_id: 103, osm_key: 'amenity', osm_value: 'restaurant', street: 'Oxford Street', city: 'London', postcode: 'W1D 1AN' }, -0.1337, 51.5154),
  feature('Nandos Close', { osm_id: 104, osm_key: 'highway', osm_value: 'residential' }, -2.24, 53.47),
  feature('Wing Stop', { osm_id: 105, osm_key: 'amenity', osm_value: 'fast_food', street: 'Oldham Street', district: 'Northern Quarter', postcode: 'M1 1JN' }, -2.2335, 53.4836),
];
const AREAS = { leeds: feature('Leeds', { osm_id: 9, osm_key: 'place', osm_value: 'city', county: 'West Yorkshire' }, -1.5491, 53.7997) };

async function mockPhoton(ctx, { fail = () => false, log = [] } = {}) {
  await ctx.route('https://photon.komoot.io/**', (route) => {
    const url = new URL(route.request().url());
    log.push(url);
    if (fail(url)) return route.fulfill({ status: 500, body: 'error' });
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const features = url.searchParams.has('bbox')
      ? VENUES.filter((f) => f.properties.name.toLowerCase().replace(/'/g, '').includes(q.replace(/'/g, '')))
      : Object.entries(AREAS).filter(([k]) => q.includes(k)).map(([, f]) => f);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features }) });
  });
}

module.exports = { mockPhoton };
