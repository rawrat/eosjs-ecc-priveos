const randomBytes = require('randombytes')
const assert = require('assert')
const PublicKey = require('./key_public')
const PrivateKey = require('./key_private')
const hash = require('./hash')
const nacl = require("tweetnacl/nacl-fast")

module.exports = {
  encrypt,
  decrypt,
  decrypt_shared_secret,
  encrypt_shared_secret,
}

const nonceLength = 24
/**
    Spec: http://localhost:3002/steem/@dantheman/how-to-encrypt-a-memo-when-transferring-steem

    @throws {Error|TypeError} - "Invalid Key, ..."

    @arg {PrivateKey} private_key - required and used for decryption
    @arg {PublicKey} public_key - required and used to calcualte the shared secret

    @return {object}
    @property {Buffer} message - Secret
*/
function encrypt(private_key, public_key, message) {
    return crypt(private_key, public_key, message, true)
}

function encrypt_shared_secret(shared_secret, message) {
  return crypt_shared_secret(shared_secret, message, true)
}
/**
    Spec: http://localhost:3002/steem/@dantheman/how-to-encrypt-a-memo-when-transferring-steem

    @arg {PrivateKey} private_key - required and used for decryption
    @arg {PublicKey} public_key - required and used to calcualte the shared secret
    @arg {string} nonce - random or unique uint64, provides entropy when re-using the same private/public keys.
    @arg {Buffer} message - Encrypted or plain text message
    @arg {number} checksum - shared secret checksum

    @throws {Error|TypeError} - "Invalid Key, ..."

    @return {Buffer} - message
*/
function decrypt(private_key, public_key, box) {
    return crypt(private_key, public_key, box, false)
}

function decrypt_shared_secret(shared_secret, box) {
  return crypt_shared_secret(shared_secret, box, false)
}

/**
    @arg {Buffer} message - Encrypted or plain text message (see checksum)
    @arg {number} checksum - shared secret checksum (null to encrypt, non-null to decrypt)
    @private
*/
function crypt(private_key, public_key, box, encrypt) {
    let nonce, message
    private_key = PrivateKey(private_key)
    if (!private_key)
        throw new TypeError('private_key is required')

    public_key = PublicKey(public_key)
    if (!public_key)
        throw new TypeError('public_key is required')  

    const S = private_key.getSharedSecret(public_key);
    return crypt_shared_secret(S, box, encrypt);
    
}

function crypt_shared_secret(S, box, encrypt) {
  let nonce, message
  if(encrypt) {
    nonce = uniqueNonce()
    message = box
  } else {
    ({nonce, message} = deserialize(box))
  }
  if (!Buffer.isBuffer(message)) {
      if (typeof message !== 'string')
          throw new TypeError('message should be buffer or string')
      message = new Buffer(message, 'binary')
  }
  assert(Buffer.isBuffer(S), "S is not a buffer")
  assert(Buffer.isBuffer(nonce), "nonce is not a buffer")
  
  const ekey_length = S.length + nonce.length
  let ebuf = Buffer.concat([nonce, S], ekey_length)
  const encryption_key = hash.sha512(ebuf)

  const iv = encryption_key.slice(32, 56)
  const key = encryption_key.slice(0, 32)

  if (encrypt) {
      message = cryptoJsEncrypt(message, key, iv)
      return serialize(nonce, message)
  } else {
      return cryptoJsDecrypt(message, key, iv)
  }
}

function serialize(nonce, message) {
  const len = nonceLength + message.length
  return Buffer.concat([nonce, message], len)
}

function deserialize(buf) {
  const nonce = buf.slice(0, nonceLength)
  const message = buf.slice(nonceLength)
  return {nonce, message}
}
/** This method both decrypts and checks the authenticity of the messsage.

    @arg {string|Buffer} message - ciphertext binary format
    @arg {string<utf8>|Buffer} key - 256bit
    @arg {string<utf8>|Buffer} iv - 192bit

    @return {Buffer}
*/
function cryptoJsDecrypt(box, key, nonce) {
    assert(box, "Missing cipher text")
    box = toBinaryBuffer(box)
    const decrypted = nacl.secretbox.open(box, nonce, key)
    if(decrypted === null) {
      throw new Error('Secretbox refused to open (wrong key or corrupted or tampered message)')
    }
    return Buffer.from(decrypted)
}

/** This method both encrypts and authenticates the message.
    @arg {string|Buffer} message - plaintext binary format
    @arg {string<utf8>|Buffer} key - 256bit
    @arg {string<utf8>|Buffer} iv - 192bit

    @return {Buffer}
*/
function cryptoJsEncrypt(message, key, nonce) {
    assert(message, "Missing plain text")
    message = toBinaryBuffer(message)
    return Buffer.from(nacl.secretbox(message, nonce, key))
}

/** @return {string} 192bit random nonce. Long enough to be unique.  This value could be recorded in the blockchain for a long time.
*/
function uniqueNonce() {
    return randomBytes(nonceLength)
}

const toBinaryBuffer = o => (o ? Buffer.isBuffer(o) ? o : new Buffer(o, 'binary') : o)
