import { Schema, model } from 'mongoose';

// Tavily results cached by normalized query. MongoDB's TTL monitor deletes rows
// after `expiresAt`; reads also check it, because the monitor runs only once a minute.
const searchCacheSchema = new Schema({
  queryHash: { type: String, required: true, unique: true },
  query: { type: String, required: true },
  results: {
    type: [{ _id: false, title: String, url: String, snippet: String }],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const SearchCache = model('SearchCache', searchCacheSchema);
