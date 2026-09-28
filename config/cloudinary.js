// config/cloudinary.js — Cliente Cloudinary + helpers de upload/remoção
// Regra de arquitetura: as imagens vão direto para o Cloudinary e apenas a
// URL resultante (secure_url) é gravada nas tabelas do Neon.
const fs     = require('fs');
const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { v2: cloudinary } = require('cloudinary');

const isConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure:     true,
    });
} else {
    console.warn('[CLOUDINARY] Credenciais ausentes no .env — uploads em nuvem desativados.');
}

/**
 * Envia um buffer (arquivo em memória) para o Cloudinary.
 * @param {Buffer} buffer
 * @param {object} opts
 * @param {string} opts.folder        pasta organizacional (ex.: 'omega-safety/n3')
 * @param {string} [opts.resourceType] image | raw | auto (auto p/ PDFs e anexos)
 * @param {string} [opts.filename]    base do public_id (sem extensão)
 * @returns {Promise<{secure_url:string, public_id:string, bytes:number, format:string}>}
 */
function uploadBuffer(buffer, { folder, resourceType = 'image', filename } = {}) {
    if (!isConfigured) {
        return Promise.reject(new Error('Cloudinary não configurado (verifique o .env).'));
    }
    if (!buffer || !buffer.length) {
        return Promise.reject(new Error('Arquivo vazio.'));
    }

    return new Promise((resolve, reject) => {
        const options = {
            resource_type: resourceType,
            folder: folder || 'omega-safety',
            unique_filename: true,
            overwrite: false,
        };
        if (filename) {
            options.use_filename    = true;
            options.unique_filename = true;
        }

        const stream = cloudinary.uploader.upload_stream(
            options,
            (err, result) => {
                if (err) {
                    let msg = err.message || String(err);
                    if (/403|forbidden|missing permissions/i.test(msg)) {
                        msg += ' — a API Key não tem permissão de escrita. No dashboard do Cloudinary: ' +
                               'Product Environment Credentials → API Keys → permissão "Read and Write".';
                    }
                    return reject(new Error(`Falha no upload para o Cloudinary: ${msg}`));
                }
                resolve({
                    secure_url: result.secure_url,
                    public_id:  result.public_id,
                    bytes:      result.bytes,
                    format:     result.format,
                });
            }
        );
        stream.end(buffer);
    });
}

/** Envia um arquivo já salvo em disco (usado pelo script de migração). */
function uploadFile(filePath, opts = {}) {
    return uploadBuffer(fs.readFileSync(filePath), opts);
}

function isCloudinaryUrl(url) {
    return typeof url === 'string' && /^https?:\/\/res\.cloudinary\.com\//i.test(url);
}

/** Extrai public_id e resource_type de uma URL do Cloudinary. */
function parseCloudinaryUrl(url) {
    if (!isCloudinaryUrl(url)) return null;
    const m = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/i);
    if (!m) return null;
    const resourceType = m[1].toLowerCase();
    let publicId = decodeURIComponent(m[2].split(/[?#]/)[0]);
    publicId = publicId.replace(/\.[a-zA-Z0-9]+$/, '');
    return { publicId, resourceType };
}

/**
 * Remove um arquivo do Cloudinary a partir da URL gravada no banco.
 * Caminhos legados (/uploads/...) são ignorados aqui — trate-os com fs.unlink.
 */
async function destroyByUrl(url) {
    if (!isConfigured || !isCloudinaryUrl(url)) return false;
    const parsed = parseCloudinaryUrl(url);
    if (!parsed) return false;
    try {
        const res = await cloudinary.uploader.destroy(parsed.publicId, {
            resource_type: parsed.resourceType,
            invalidate: true,
        });
        return res && res.result === 'ok';
    } catch (err) {
        console.warn('[CLOUDINARY] Não foi possível remover', parsed.publicId, '→', err.message);
        return false;
    }
}

/** Remove arquivo legado em disco, se existir (retrocompatibilidade). */
function removeLocalFile(storedPath) {
    try {
        if (!storedPath || !storedPath.startsWith('/uploads/')) return false;
        const abs = path.join(__dirname, '..', storedPath);
        if (fs.existsSync(abs)) { fs.unlinkSync(abs); return true; }
    } catch (err) {
        console.warn('[UPLOADS] Falha ao remover arquivo local:', err.message);
    }
    return false;
}

/**
 * Remove a mídia associada a um valor gravado no banco:
 * URL do Cloudinary → destroy; caminho legado → apaga do disco.
 */
async function removeMedia(storedValue) {
    if (!storedValue) return false;
    if (isCloudinaryUrl(storedValue)) return await destroyByUrl(storedValue);
    return removeLocalFile(storedValue);
}

/** Verificação rápida usada pelo /api/health. */
async function pingCloudinary(timeoutMs = 5000) {
    if (!isConfigured) return { configured: false, ok: false, detail: 'credenciais ausentes' };
    try {
        const res = await Promise.race([
            cloudinary.api.ping(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
        return { configured: true, ok: res && res.status === 'ok', detail: (res && res.status) || 'unknown' };
    } catch (err) {
        return { configured: true, ok: false, detail: err.message };
    }
}

module.exports = {
    cloudinary,
    isConfigured,
    uploadBuffer,
    uploadFile,
    isCloudinaryUrl,
    parseCloudinaryUrl,
    destroyByUrl,
    removeLocalFile,
    removeMedia,
    pingCloudinary,
};
