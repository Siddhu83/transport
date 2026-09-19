import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
/**
 * Hash a plain text password using Node.js crypto scrypt
 */
export async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64));
    return `${salt}:${derivedKey.toString('hex')}`;
}
/**
 * Verify a plain text password against a stored salt:hash string
 */
export async function verifyPassword(password, combinedHash) {
    const [salt, keyHex] = combinedHash.split(':');
    if (!salt || !keyHex)
        return false;
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64));
    if (keyBuffer.length !== derivedKey.length)
        return false;
    return timingSafeEqual(keyBuffer, derivedKey);
}
