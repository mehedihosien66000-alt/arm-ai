import mammoth from 'mammoth';
import type { ChatAttachment } from '../types/chat';
import {
  chunkDocumentText,
  classifyAttachmentFile,
  createId,
  sanitizeDocumentText,
} from './chatLogic';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
    reader.readAsArrayBuffer(file);
  });
}

export async function processUploadedFile(file: File): Promise<ChatAttachment> {
  const classified = classifyAttachmentFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });

  if (!classified.ok) {
    throw new Error(classified.error);
  }

  if (classified.kind === 'docx') {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const extracted = await mammoth.extractRawText({ arrayBuffer });
    const chunked = chunkDocumentText(extracted.value || '');
    if (!chunked.text) {
      throw new Error(`No readable text could be extracted from "${file.name}".`);
    }
    return {
      id: createId('att'),
      name: file.name,
      mimeType: classified.mimeType,
      size: file.size,
      kind: 'docx',
      data: chunked.text,
      chunkCount: chunked.chunkCount,
    };
  }

  if (classified.kind === 'text') {
    const rawText = await readFileAsText(file);
    const chunked = chunkDocumentText(sanitizeDocumentText(rawText));
    return {
      id: createId('att'),
      name: file.name,
      mimeType: classified.mimeType,
      size: file.size,
      kind: 'text',
      data: chunked.text,
      chunkCount: chunked.chunkCount,
    };
  }

  const dataUrl = await readFileAsDataUrl(file);
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  return {
    id: createId('att'),
    name: file.name,
    mimeType: classified.mimeType,
    size: file.size,
    kind: classified.kind,
    data: base64,
    previewUrl: classified.kind === 'image' ? dataUrl : undefined,
  };
}
