class AppError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}
const wrapAll = o => Object.fromEntries(Object.entries(o).map(([k, fn]) => [k, (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)]));
const notFound = (req, res) => res.status(404).json({ error: 'Not found.' });
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, ...(err.fields && { fields: err.fields }) });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Files must be under ${process.env.MAX_UPLOAD_MB || 10} MB.` : 'Upload failed.' });
  if (err.code === '22P02') return res.status(404).json({ error: 'Not found.' });          // malformed uuid
  if (err.code === '23505') return res.status(409).json({ error: 'That already exists.' });
  if (err.code === '23503') return res.status(400).json({ error: 'A related record does not exist.' });
  if (err.code === '23514') return res.status(400).json({ error: 'Some values are not allowed.' });
  console.error(err); // details stay in server logs only
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
};
module.exports = { AppError, wrapAll, notFound, errorHandler };
