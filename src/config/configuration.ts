// Typed configuration factory — reads process.env into a nested object.
// Registered via ConfigModule.forRoot({ load: [configuration] }).
export default () => ({
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appUrl: process.env.APP_URL ?? 'http://localhost:8080',
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
    /** Storefront customers stay signed in longer than admins. */
    customerExpiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN ?? '7d',
  },
  /** Seller details printed on invoices. With no GSTIN the shop issues a Bill of Supply (no GST). */
  invoice: {
    legalName: process.env.INVOICE_LEGAL_NAME ?? 'Shreeni Sarees Pvt. Ltd.',
    brandName: process.env.INVOICE_BRAND_NAME ?? 'Shreeni',
    gstin: (process.env.INVOICE_GSTIN ?? '').trim().toUpperCase(),
    /** Lines separated by "|" or newlines. */
    address: process.env.INVOICE_ADDRESS ?? '14/8/A, Chowdhuri Para Street|Chowdhuri Para, Near Doltala|Halisahar 743134',
    /** Registered state; with a GSTIN, the GSTIN's state code wins. */
    state: process.env.INVOICE_STATE ?? 'West Bengal',
    email: process.env.INVOICE_EMAIL ?? 'support@shreeni.example.com',
    phone: process.env.INVOICE_PHONE ?? '+91 97485 94143',
    /** Up to 4 characters: "SHR" → SHR/26-27/0001. */
    prefix: (process.env.INVOICE_PREFIX ?? 'SHR').trim().toUpperCase(),
  },
  aws: {
    region: process.env.AWS_REGION,
    s3Bucket: process.env.AWS_S3_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
