const tenantEnvPrefix = (tenant) => tenant.key.toUpperCase().replace(/[^A-Z0-9]/g, '_');

const defaultTenantKey = () =>
  (process.env.DEFAULT_TENANT_KEY || 'rosita-waters').trim().toLowerCase();

// Tenant credentials come from TENANT_<KEY>_<NAME>. Only when a caller opts in
// with { allowDefaultFallback: true } AND the tenant is the default tenant is the
// unprefixed variable used. Other clients can never read another client's keys.
const getTenantEnv = (tenant, name, { allowDefaultFallback = false } = {}) => {
  if (!tenant || typeof tenant.key !== 'string') {
    throw new Error('Tenant context is required to load integration configuration.');
  }
  const scoped = process.env[`TENANT_${tenantEnvPrefix(tenant)}_${name}`];
  if (scoped) return scoped;
  if (allowDefaultFallback && tenant.key === defaultTenantKey()) {
    return process.env[name] || undefined;
  }
  return undefined;
};

module.exports = { getTenantEnv };
