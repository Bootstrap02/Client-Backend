const tenantEnvPrefix = (tenant) => tenant.key.toUpperCase().replace(/[^A-Z0-9]/g, '_');

const getTenantEnv = (tenant, name) => {
  if (!tenant || typeof tenant.key !== 'string') {
    throw new Error('Tenant context is required to load integration configuration.');
  }
  return process.env[`TENANT_${tenantEnvPrefix(tenant)}_${name}`] || undefined;
};

module.exports = { getTenantEnv };
