import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => console.info('[db] reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // Build declared indexes (unique deviceId, TTL on searchCache) before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  console.info(`[db] connected to "${mongoose.connection.name}"`);
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function dbState(): 'connected' | 'connecting' | 'disconnected' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
