import fs from 'fs';
import crypto from 'crypto';

// Function to calculate the hash of a file
export const calculateFileHash = (filePath) => {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
};
