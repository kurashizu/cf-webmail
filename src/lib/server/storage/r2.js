// Thin wrapper around the R2Bucket binding, giving it the same put/get/delete
// shape as the S3 adapter so callers never branch on backend type.

/** @param {R2Bucket} bucket */
export function createR2Storage(bucket) {
	return {
		backend: 'r2',

		async put(key, data, opts = {}) {
			await bucket.put(key, data, opts);
		},

		async get(key) {
			return bucket.get(key);
		},

		/** @param {string|string[]} keys */
		async delete(keys) {
			await bucket.delete(keys);
		}
	};
}
