export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function databaseResult(result) {
  if (!result.error) return result.data;
  const code = result.error.code;
  if (code === '23505') throw new HttpError(409, 'An entry already exists for these dates, or a period is still ongoing.');
  if (code === '23P01') throw new HttpError(409, 'These dates overlap an existing period.');
  if (code === '23514' || code === '22007' || code === '22008' || code === '22P02') {
    throw new HttpError(400, 'The entry contains invalid values.');
  }
  if (code === '42501') throw new HttpError(403, 'You cannot access this record.');
  if (code === 'PGRST301' || code === 'PGRST303') throw new HttpError(401, 'Please sign in again.');
  // Never return database details containing personal information.
  throw new HttpError(502, 'The database request could not be completed.');
}
