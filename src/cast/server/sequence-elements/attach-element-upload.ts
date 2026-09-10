import { fileExists } from '#storage';
import { deriveTokenFromFilename } from '@/cast/derive-token';
import type { DraftElementUploadInput } from '@/cast/draft-element-upload';
import type { SequenceElement } from '@/platform/server/db/schema';
import type { ScopedDb } from '@/platform/server/db/scoped';
import { NotFoundError, ValidationError } from '@/platform/errors';
import { generateId } from '@/platform/id';
import { STORAGE_BUCKETS } from '@/platform/server/storage/buckets';
import { triggerWorkflow } from '@/platform/server/workflow/client';
import type { ElementVisionWorkflowInput } from '@/platform/server/workflow/types';
import {
  elementBucketPath,
  elementImageUrlFromPath,
  isValidElementStoragePath,
} from './storage-path';

/**
 * Fire the element-vision workflow for a row that has no description yet.
 * Exported for `replaceSequenceElementFn`, which re-runs vision against an
 * existing row rather than creating one.
 */
export async function triggerElementVision(params: {
  elementId: string;
  sequenceId: string;
  imageUrl: string;
  filename: string;
  token: string;
  teamId: string;
  userId: string;
}): Promise<void> {
  const { teamId, userId, ...element } = params;
  const input: ElementVisionWorkflowInput = { userId, teamId, ...element };
  await triggerWorkflow('/element-vision', input);
}

/**
 * Attach one already-uploaded R2 object to a sequence as a `sequence_elements`
 * row, then run vision on it unless the caller already has a description.
 *
 * **Nothing is moved or copied** (#1471). The object stays where it was
 * uploaded and the row points straight at it, so N sequences can share one
 * draft upload — which is what creation does, fanning out one sequence per
 * selected analysis model. The predecessor moved the object on the way in, so
 * the first of those N deleted it out from under its siblings.
 *
 * `path` is client-supplied, so it is checked twice: inside the team's
 * namespace, and actually present in R2. The second check is not paranoia —
 * the move it replaces was the only thing proving the object existed, and
 * without it a row can point at a permanent 404 that nothing surfaces until
 * image generation fails hours later.
 */
export async function attachElementUpload(params: {
  scopedDb: ScopedDb;
  teamId: string;
  userId: string;
  sequenceId: string;
  path: string;
  filename: string;
  token?: string | null;
  description?: string | null;
  consistencyTag?: string | null;
}): Promise<SequenceElement> {
  const { scopedDb, teamId, userId, sequenceId, path, filename } = params;

  if (!isValidElementStoragePath(path, teamId)) {
    throw new ValidationError(
      `Element "${filename}" could not be attached: its upload is outside this team's storage.`
    );
  }
  if (!(await fileExists(STORAGE_BUCKETS.ELEMENTS, elementBucketPath(path)))) {
    throw new NotFoundError(
      `Element "${filename}" is no longer available in storage. Re-upload it and try again.`
    );
  }

  const imageUrl = elementImageUrlFromPath(path);
  const token = await scopedDb.sequenceElements.ensureUniqueToken(
    sequenceId,
    params.token || deriveTokenFromFilename(filename)
  );

  // Vision ran inline during draft upload (the happy path); write it straight
  // onto the row instead of paying for it a second time.
  const hasInlineVision = !!params.description && !!params.consistencyTag;

  const element = await scopedDb.sequenceElements.create({
    id: generateId(),
    sequenceId,
    uploadedFilename: filename,
    token,
    imageUrl,
    imagePath: path,
    description: hasInlineVision ? params.description : null,
    consistencyTag: hasInlineVision ? params.consistencyTag : null,
    visionStatus: hasInlineVision ? 'completed' : 'pending',
    visionGeneratedAt: hasInlineVision ? new Date() : null,
  });

  if (hasInlineVision) return element;

  // If the trigger fails, mark the row failed before re-throwing — otherwise
  // the element would poll forever in `pending`.
  try {
    await triggerElementVision({
      elementId: element.id,
      sequenceId,
      imageUrl,
      filename: element.uploadedFilename,
      token: element.token,
      teamId,
      userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await scopedDb.sequenceElements.updateVisionStatus(
      element.id,
      'failed',
      message
    );
    throw err;
  }

  return element;
}

/**
 * Attach every draft element upload carried on a create request to the
 * freshly created sequence. Runs before the storyboard trigger so
 * analyze-script's `waitForElementVision` gate has rows to wait on.
 */
export async function attachDraftElementUploads(params: {
  scopedDb: ScopedDb;
  teamId: string;
  userId: string;
  sequenceId: string;
  uploads: DraftElementUploadInput[];
}): Promise<void> {
  const { uploads, ...rest } = params;
  for (const upload of uploads) {
    await attachElementUpload({
      ...rest,
      path: upload.tempPath,
      filename: upload.filename,
      token: upload.token,
      description: upload.description,
      consistencyTag: upload.consistencyTag,
    });
  }
}
