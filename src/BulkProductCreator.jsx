import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildItemId,
  getItemType,
  getItemTypeMatches,
  getRecommendedItemType,
  itemTypeImageRequirementLabel,
  itemTypes,
  nextItemSequence,
} from './itemTypes'
import {
  BULK_PRODUCT_IMAGE_ACCEPT,
  bulkProductImageValidationError,
  prepareBulkProductImage,
} from './bulkProductImages'
import { shopCategories } from './shopCatalog'
import { getFriendlyErrorMessage } from './friendlyErrors'

const groupColors = [
  '#0057ff',
  '#d92d20',
  '#008a5b',
  '#7a4cff',
  '#b54708',
  '#0e7090',
  '#c11574',
  '#475467',
]
const PREVIEW_CONCURRENCY = 2
const PREVIEW_UI_TIMEOUT_MS = 30000
const DEFAULT_PREVIEW_DIMENSION = 128
const DEFAULT_THUMBNAIL_SCALE = 100
const MIN_THUMBNAIL_SCALE = 25
const MAX_THUMBNAIL_SCALE = 200
const THUMBNAIL_SCALE_STEP = 25

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0
  const workerCount = Math.min(limit, items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  })

  await Promise.all(workers)
}

function localId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function defaultDraftForGroup(imageCount) {
  const recommendedType = getRecommendedItemType(imageCount)

  return {
    categoryId: recommendedType?.categoryId ?? shopCategories[0].id,
    description: '',
    itemTypeCode: recommendedType?.code ?? '',
    name: '',
    price: '',
    status: 'draft',
  }
}

function draftValidationError(draft) {
  const price = Number.parseFloat(draft?.price)

  if (!draft?.name?.trim()) {
    return 'Add a name.'
  }

  if (!Number.isFinite(price) || price < 0) {
    return 'Add a valid price.'
  }

  if (!draft?.description?.trim()) {
    return 'Add a description.'
  }

  if (!getItemType(draft?.itemTypeCode)) {
    return 'Choose a type.'
  }

  if (!draft?.categoryId) {
    return 'Choose a shop section.'
  }

  return ''
}

function groupLabel(groups, groupId) {
  const index = groups.findIndex((group) => group.id === groupId)

  return index === -1 ? 'Group' : `Group ${index + 1}`
}

function photoFileLabel(count) {
  return `${count} photo${count === 1 ? '' : 's'}`
}

function recommendationText(imageCount) {
  const matches = getItemTypeMatches(imageCount)

  if (matches.length === 0) {
    return 'No exact type match for this image count.'
  }

  return `${photoFileLabel(imageCount)} matches ${matches
    .map((type) => `${type.code} ${type.label}`)
    .join(' or ')}.`
}

function loadImageDimensions(src) {
  return new Promise((resolve) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        height: image.naturalHeight || DEFAULT_PREVIEW_DIMENSION,
        width: image.naturalWidth || DEFAULT_PREVIEW_DIMENSION,
      })
    }
    image.onerror = () => {
      resolve({
        height: DEFAULT_PREVIEW_DIMENSION,
        width: DEFAULT_PREVIEW_DIMENSION,
      })
    }
    image.src = src
  })
}

function BulkProductCreator({ existingProducts, isSaving, onCancel, onSaveGroups, savingMessage }) {
  const [activeDraftGroupId, setActiveDraftGroupId] = useState('')
  const [activeGroupId, setActiveGroupId] = useState('')
  const [batchDate] = useState(() => new Date())
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [groups, setGroups] = useState([])
  const [photos, setPhotos] = useState([])
  const [queueOpen, setQueueOpen] = useState(false)
  const [step, setStep] = useState('grouping')
  const [thumbnailScale, setThumbnailScale] = useState(DEFAULT_THUMBNAIL_SCALE)
  const [viewingPhotoId, setViewingPhotoId] = useState('')
  const galleryClickTimerRef = useRef(null)
  const isMountedRef = useRef(true)
  const lastGroupedPhotoIdRef = useRef('')
  const previewTimersRef = useRef(new Map())
  const previewUrlsRef = useRef(new Set())

  useEffect(() => {
    isMountedRef.current = true
    const previewTimers = previewTimersRef.current
    const previewUrls = previewUrlsRef.current

    return () => {
      isMountedRef.current = false
      clearTimeout(galleryClickTimerRef.current)
      previewTimers.forEach((timerId) => clearTimeout(timerId))
      previewTimers.clear()
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl))
      previewUrls.clear()
    }
  }, [])

  const photosByGroup = useMemo(() => {
    const map = new Map(groups.map((group) => [group.id, []]))

    photos.forEach((photo) => {
      if (photo.groupId && map.has(photo.groupId)) {
        map.get(photo.groupId).push(photo)
      }
    })

    return map
  }, [groups, photos])

  const groupsWithPhotos = useMemo(
    () => groups.filter((group) => (photosByGroup.get(group.id)?.length ?? 0) > 0),
    [groups, photosByGroup],
  )

  const ungroupedCount = useMemo(
    () => photos.filter((photo) => !photo.groupId).length,
    [photos],
  )
  const preparingPhotoCount = useMemo(
    () => photos.filter((photo) => photo.isPreparing).length,
    [photos],
  )
  const readyPreviewCount = useMemo(
    () => photos.filter((photo) => photo.previewUrl).length,
    [photos],
  )

  const itemIdPreviews = useMemo(() => {
    const reservedIds = new Set()
    const previews = {}

    groupsWithPhotos.forEach((group) => {
      const typeCode = drafts[group.id]?.itemTypeCode

      if (!typeCode) {
        previews[group.id] = ''
        return
      }

      const sequence = nextItemSequence(existingProducts, typeCode, batchDate, reservedIds)
      const itemId = buildItemId(typeCode, batchDate, sequence)
      reservedIds.add(itemId)
      previews[group.id] = itemId
    })

    return previews
  }, [batchDate, drafts, existingProducts, groupsWithPhotos])

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null
  const activeDraftGroup = groupsWithPhotos.find((group) => group.id === activeDraftGroupId) ?? groupsWithPhotos[0] ?? null
  const activeDraft = activeDraftGroup ? drafts[activeDraftGroup.id] ?? defaultDraftForGroup(0) : null
  const activeDraftPhotos = activeDraftGroup ? photosByGroup.get(activeDraftGroup.id) ?? [] : []
  const activeDraftIndex = activeDraftGroup
    ? groupsWithPhotos.findIndex((group) => group.id === activeDraftGroup.id)
    : -1
  const readyGroupCount = groupsWithPhotos.filter((group) => !draftValidationError(drafts[group.id])).length
  const viewingPhoto = photos.find((photo) => photo.id === viewingPhotoId) ?? null
  const thumbnailScaleLabel = `${thumbnailScale}%`

  const createGroupRecord = (index) => ({
    color: groupColors[index % groupColors.length],
    id: localId('group'),
  })

  const updateThumbnailScale = (nextScale) => {
    const clampedScale = Math.min(
      MAX_THUMBNAIL_SCALE,
      Math.max(MIN_THUMBNAIL_SCALE, Number(nextScale) || DEFAULT_THUMBNAIL_SCALE),
    )

    setThumbnailScale(clampedScale)
  }

  useEffect(() => {
    if (!viewingPhoto) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setViewingPhotoId('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewingPhoto])

  const clearPreviewTimer = (photoId) => {
    const timerId = previewTimersRef.current.get(photoId)

    if (timerId) {
      clearTimeout(timerId)
      previewTimersRef.current.delete(photoId)
    }
  }

  const startPreviewTimer = (photo) => {
    clearPreviewTimer(photo.id)

    const timerId = setTimeout(() => {
      previewTimersRef.current.delete(photo.id)

      if (!isMountedRef.current) {
        return
      }

      const timeoutMessage = `Preview took too long for ${photo.file.name}. Try exporting it as a JPEG first.`
      setPhotos((current) =>
        current.map((currentPhoto) =>
          currentPhoto.id === photo.id && currentPhoto.isPreparing
            ? {
                ...currentPhoto,
                isPreparing: false,
                previewError: timeoutMessage,
              }
            : currentPhoto,
        ),
      )
      setError(timeoutMessage)
    }, PREVIEW_UI_TIMEOUT_MS)

    previewTimersRef.current.set(photo.id, timerId)
  }

  const createGroup = () => {
    const group = createGroupRecord(groups.length)
    setGroups((current) => [...current, group])
    setActiveGroupId(group.id)
    setError('')
  }

  const handleFiles = (event) => {
    const files = Array.from(event.target.files ?? [])
    const acceptedPhotos = []
    let rejectedCount = 0
    let firstError = ''

    files.forEach((file) => {
      const validationError = bulkProductImageValidationError(file)

      if (validationError) {
        rejectedCount += 1
        firstError ||= validationError
        return
      }

      acceptedPhotos.push({
        file,
        groupId: '',
        id: localId('photo'),
        isPreparing: true,
        previewDimensions: null,
        previewError: '',
        previewUrl: '',
      })
    })

    if (acceptedPhotos.length > 0) {
      setPhotos((current) => [...current, ...acceptedPhotos])

      if (groups.length === 0) {
        const group = createGroupRecord(0)
        setGroups([group])
        setActiveGroupId(group.id)
      }

      runWithConcurrency(acceptedPhotos, PREVIEW_CONCURRENCY, async (photo) => {
        startPreviewTimer(photo)

        try {
          const { previewUrl, uploadFile } = await prepareBulkProductImage(photo.file)
          const previewDimensions = await loadImageDimensions(previewUrl)
          clearPreviewTimer(photo.id)

          if (!isMountedRef.current) {
            URL.revokeObjectURL(previewUrl)
            return
          }

          previewUrlsRef.current.add(previewUrl)
          setPhotos((current) => {
            if (!current.some((currentPhoto) => currentPhoto.id === photo.id)) {
              URL.revokeObjectURL(previewUrl)
              previewUrlsRef.current.delete(previewUrl)
              return current
            }

            return current.map((currentPhoto) =>
              currentPhoto.id === photo.id
                ? {
                    ...currentPhoto,
                    file: uploadFile,
                    isPreparing: false,
                    previewDimensions,
                    previewError: '',
                    previewUrl,
                  }
                : currentPhoto,
            )
          })
        } catch (previewError) {
          clearPreviewTimer(photo.id)

          if (!isMountedRef.current) {
            return
          }

          setPhotos((current) =>
            current.map((currentPhoto) =>
              currentPhoto.id === photo.id
                ? {
                    ...currentPhoto,
                    isPreparing: false,
                    previewError: previewError.message,
                  }
                : currentPhoto,
            ),
          )
          setError(getFriendlyErrorMessage(previewError, 'admin'))
        }
      }).catch((queueError) => {
        if (isMountedRef.current) {
          setError(getFriendlyErrorMessage(queueError, 'admin'))
        }
      })
    }

    setError(rejectedCount > 0 ? `${rejectedCount} file${rejectedCount === 1 ? '' : 's'} skipped. ${firstError}` : '')
    event.target.value = ''
  }

  const togglePhotoInActiveGroup = (photo) => {
    let nextActiveGroupId = activeGroupId

    if (!nextActiveGroupId) {
      const nextActiveGroup = createGroupRecord(groups.length)
      nextActiveGroupId = nextActiveGroup.id
      setGroups((current) => [...current, nextActiveGroup])
      setActiveGroupId(nextActiveGroupId)
    }

    setPhotos((current) =>
      current.map((currentPhoto) =>
        currentPhoto.id === photo.id
          ? {
              ...currentPhoto,
              groupId: currentPhoto.groupId === nextActiveGroupId ? '' : nextActiveGroupId,
            }
          : currentPhoto,
      ),
    )
    setError('')
  }

  const assignPhotoRangeToActiveGroup = (photo) => {
    let nextActiveGroupId = activeGroupId

    if (!nextActiveGroupId) {
      const nextActiveGroup = createGroupRecord(groups.length)
      nextActiveGroupId = nextActiveGroup.id
      setGroups((current) => [...current, nextActiveGroup])
      setActiveGroupId(nextActiveGroupId)
    }

    const anchorPhotoId = lastGroupedPhotoIdRef.current
    const anchorIndex = photos.findIndex((currentPhoto) => currentPhoto.id === anchorPhotoId)
    const photoIndex = photos.findIndex((currentPhoto) => currentPhoto.id === photo.id)

    if (anchorIndex === -1 || photoIndex === -1) {
      setPhotos((current) =>
        current.map((currentPhoto) =>
          currentPhoto.id === photo.id
            ? {
                ...currentPhoto,
                groupId: currentPhoto.groupId === nextActiveGroupId ? '' : nextActiveGroupId,
              }
            : currentPhoto,
        ),
      )
      setError('')
      return
    }

    const [startIndex, endIndex] = [anchorIndex, photoIndex].sort((left, right) => left - right)
    const selectedPhotoIds = new Set(
      photos.slice(startIndex, endIndex + 1).map((selectedPhoto) => selectedPhoto.id),
    )

    setPhotos((current) =>
      current.map((currentPhoto) =>
        selectedPhotoIds.has(currentPhoto.id)
          ? {
              ...currentPhoto,
              groupId: nextActiveGroupId,
            }
          : currentPhoto,
      ),
    )
    setError('')
  }

  const handlePhotoClick = (photo, event) => {
    const isRangeSelection = event.shiftKey
    clearTimeout(galleryClickTimerRef.current)

    galleryClickTimerRef.current = setTimeout(() => {
      if (isRangeSelection) {
        assignPhotoRangeToActiveGroup(photo)
      } else {
        togglePhotoInActiveGroup(photo)
      }
      lastGroupedPhotoIdRef.current = photo.id
      galleryClickTimerRef.current = null
    }, 180)
  }

  const openPhotoViewer = (photo) => {
    clearTimeout(galleryClickTimerRef.current)
    galleryClickTimerRef.current = null
    setViewingPhotoId(photo.id)
  }

  const assignUngroupedToActiveGroup = () => {
    let targetGroupId = activeGroupId

    if (!targetGroupId) {
      const group = createGroupRecord(groups.length)
      targetGroupId = group.id
      setGroups((current) => [...current, group])
      setActiveGroupId(targetGroupId)
    }

    setPhotos((current) =>
      current.map((photo) => (photo.groupId ? photo : { ...photo, groupId: targetGroupId })),
    )
    setError('')
  }

  const clearActiveGroup = () => {
    if (!activeGroupId) {
      return
    }

    setPhotos((current) =>
      current.map((photo) => (photo.groupId === activeGroupId ? { ...photo, groupId: '' } : photo)),
    )
    setError('')
  }

  const deleteActiveGroup = () => {
    if (!activeGroupId) {
      return
    }

    const remainingGroups = groups.filter((group) => group.id !== activeGroupId)
    setGroups(remainingGroups)
    setPhotos((current) =>
      current.map((photo) => (photo.groupId === activeGroupId ? { ...photo, groupId: '' } : photo)),
    )
    setDrafts((current) => {
      const nextDrafts = { ...current }
      delete nextDrafts[activeGroupId]
      return nextDrafts
    })
    setActiveGroupId(remainingGroups[0]?.id ?? '')
    setError('')
  }

  const removePhoto = (photoId) => {
    const photo = photos.find((currentPhoto) => currentPhoto.id === photoId)
    clearTimeout(galleryClickTimerRef.current)
    galleryClickTimerRef.current = null
    clearPreviewTimer(photoId)

    if (photo) {
      URL.revokeObjectURL(photo.previewUrl)
      previewUrlsRef.current.delete(photo.previewUrl)
    }

    setPhotos((current) => current.filter((currentPhoto) => currentPhoto.id !== photoId))
    setViewingPhotoId((currentPhotoId) => (currentPhotoId === photoId ? '' : currentPhotoId))
    setError('')
  }

  const proceedToDetails = () => {
    if (photos.length === 0) {
      setError('Upload photos before creating product drafts.')
      return
    }

    if (groupsWithPhotos.length === 0) {
      setError('Create at least one group.')
      return
    }

    setGroups(groupsWithPhotos)
    setActiveGroupId((currentGroupId) =>
      groupsWithPhotos.some((group) => group.id === currentGroupId)
        ? currentGroupId
        : groupsWithPhotos[0].id,
    )
    setDrafts((current) => {
      const nextDrafts = {}

      groupsWithPhotos.forEach((group) => {
        nextDrafts[group.id] =
          current[group.id] ?? defaultDraftForGroup(photosByGroup.get(group.id)?.length ?? 0)
      })

      return nextDrafts
    })
    setActiveDraftGroupId(groupsWithPhotos[0].id)
    setQueueOpen(groupsWithPhotos.length > 1)
    setStep('details')
    setError('')
  }

  const updateDraft = (key, value) => {
    if (!activeDraftGroup) {
      return
    }

    setDrafts((current) => {
      const currentDraft =
        current[activeDraftGroup.id] ?? defaultDraftForGroup(activeDraftPhotos.length)
      const selectedType = key === 'itemTypeCode' ? getItemType(value) : null

      return {
        ...current,
        [activeDraftGroup.id]: {
          ...currentDraft,
          [key]: value,
          ...(selectedType ? { categoryId: selectedType.categoryId } : {}),
        },
      }
    })
  }

  const moveDraft = (direction) => {
    if (activeDraftIndex === -1) {
      return
    }

    const nextIndex = activeDraftIndex + direction
    const nextGroup = groupsWithPhotos[nextIndex]

    if (nextGroup) {
      setActiveDraftGroupId(nextGroup.id)
      setError('')
    }
  }

  const saveAllDrafts = async () => {
    const invalidGroup = groupsWithPhotos.find((group) => draftValidationError(drafts[group.id]))

    if (invalidGroup) {
      setActiveDraftGroupId(invalidGroup.id)
      setError(`${groupLabel(groupsWithPhotos, invalidGroup.id)} needs details before saving.`)
      return
    }

    const groupedDrafts = groupsWithPhotos.map((group) => ({
      color: group.color,
      draft: drafts[group.id],
      files: (photosByGroup.get(group.id) ?? []).map((photo) => photo.file),
      groupId: group.id,
      imageCount: photosByGroup.get(group.id)?.length ?? 0,
      itemIdPreview: itemIdPreviews[group.id],
    }))

    setError('')
    try {
      await onSaveGroups(groupedDrafts, { batchDate })
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, 'admin'))
    }
  }

  if (step === 'details') {
    return (
      <section className="admin-bulk-creator" aria-label="Product draft details">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">Draft details</p>
            <h2>{activeDraftGroup ? groupLabel(groupsWithPhotos, activeDraftGroup.id) : 'Drafts'}</h2>
          </div>
          <div className="admin-row admin-workflow-actions">
            <button
              className="admin-button is-secondary"
              disabled={isSaving}
              type="button"
              onClick={() => setQueueOpen((current) => !current)}
            >
              Draft Queue ({readyGroupCount}/{groupsWithPhotos.length})
            </button>
            <button className="admin-button is-secondary" disabled={isSaving} type="button" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>

        {error && <p className="admin-alert is-error">{error}</p>}
        {savingMessage && <p className="admin-alert">{savingMessage}</p>}

        {queueOpen && (
          <div className="admin-draft-queue-panel" aria-label="Draft queue">
            {groupsWithPhotos.map((group) => {
              const groupPhotos = photosByGroup.get(group.id) ?? []
              const draft = drafts[group.id]
              const ready = !draftValidationError(draft)

              return (
                <button
                  className={group.id === activeDraftGroup?.id ? 'is-active' : ''}
                  key={group.id}
                  style={{ '--group-color': group.color }}
                  type="button"
                  onClick={() => {
                    setActiveDraftGroupId(group.id)
                    setError('')
                  }}
                >
                  <span className="admin-group-swatch" aria-hidden="true" />
                  <strong>{draft?.name?.trim() || groupLabel(groupsWithPhotos, group.id)}</strong>
                  <span>{itemIdPreviews[group.id] || 'Type needed'}</span>
                  <small>{photoFileLabel(groupPhotos.length)} / {ready ? 'Ready' : 'Needs details'}</small>
                </button>
              )
            })}
          </div>
        )}

        {activeDraftGroup && (
          <form className="admin-editor admin-draft-workspace" onSubmit={(event) => event.preventDefault()}>
            <div className="admin-draft-media" style={{ '--group-color': activeDraftGroup.color }}>
              <div className="admin-draft-primary">
                {activeDraftPhotos[0]?.previewUrl ? (
                  <img
                    alt={`${groupLabel(groupsWithPhotos, activeDraftGroup.id)} primary preview`}
                    decoding="async"
                    src={activeDraftPhotos[0].previewUrl}
                  />
                ) : (
                  <span className="admin-photo-preview-placeholder">
                    {activeDraftPhotos[0]?.previewError ? 'Preview unavailable' : 'Preparing preview'}
                  </span>
                )}
              </div>
              <div className="admin-draft-strip" aria-label="Grouped photos">
                {activeDraftPhotos.map((photo) =>
                  photo.previewUrl ? (
                    <img
                      alt={photo.file.name}
                      decoding="async"
                      key={photo.id}
                      src={photo.previewUrl}
                    />
                  ) : (
                    <span className="admin-photo-preview-placeholder" key={photo.id}>
                      {photo.previewError ? 'No preview' : 'Preparing'}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="admin-form-grid">
              <div className="admin-id-preview is-wide">
                <span>Item ID</span>
                <strong>{itemIdPreviews[activeDraftGroup.id] || 'Choose a type'}</strong>
              </div>

              <p className="admin-recommendation is-wide">
                {recommendationText(activeDraftPhotos.length)}
              </p>

              <label className="is-wide">
                <span>Name</span>
                <input
                  required
                  value={activeDraft.name}
                  onChange={(event) => updateDraft('name', event.target.value)}
                />
              </label>

              <label>
                <span>Type</span>
                <select
                  required
                  value={activeDraft.itemTypeCode}
                  onChange={(event) => updateDraft('itemTypeCode', event.target.value)}
                >
                  <option value="">Choose type</option>
                  {itemTypes.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.code} - {type.label} ({itemTypeImageRequirementLabel(type)})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Price</span>
                <input
                  required
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={activeDraft.price}
                  onChange={(event) => updateDraft('price', event.target.value)}
                />
              </label>

              <label>
                <span>Shop section</span>
                <select
                  required
                  value={activeDraft.categoryId}
                  onChange={(event) => updateDraft('categoryId', event.target.value)}
                >
                  {shopCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={activeDraft.status}
                  onChange={(event) => updateDraft('status', event.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>

              <label className="is-wide">
                <span>Description</span>
                <textarea
                  required
                  rows="5"
                  value={activeDraft.description}
                  onChange={(event) => updateDraft('description', event.target.value)}
                />
              </label>

              <div className="admin-row admin-workflow-actions is-wide">
                <button
                  className="admin-button is-secondary"
                  disabled={isSaving}
                  type="button"
                  onClick={() => setStep('grouping')}
                >
                  Back
                </button>
                <div className="admin-row admin-workflow-actions">
                  <button
                    className="admin-button is-secondary"
                    disabled={isSaving || activeDraftIndex <= 0}
                    type="button"
                    onClick={() => moveDraft(-1)}
                  >
                    Previous
                  </button>
                  <button
                    className="admin-button is-secondary"
                    disabled={isSaving || activeDraftIndex >= groupsWithPhotos.length - 1}
                    type="button"
                    onClick={() => moveDraft(1)}
                  >
                    Next group
                  </button>
                  <button className="admin-button" disabled={isSaving} type="button" onClick={saveAllDrafts}>
                    {isSaving ? 'Saving...' : 'Save all drafts'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </section>
    )
  }

  return (
    <section className="admin-bulk-creator" aria-label="Bulk product upload">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">New item workflow</p>
          <h2>Upload and group photos</h2>
        </div>
        <button className="admin-button is-secondary" disabled={isSaving} type="button" onClick={onCancel}>
          Close
        </button>
      </div>

      {error && <p className="admin-alert is-error">{error}</p>}

      <div className="admin-upload-zone">
        <label>
          <span>Upload photos</span>
          <input
            accept={BULK_PRODUCT_IMAGE_ACCEPT}
            disabled={isSaving}
            multiple
            type="file"
            onChange={handleFiles}
          />
        </label>
        <strong>
          {preparingPhotoCount > 0
            ? `${readyPreviewCount}/${photos.length} previews ready`
            : photoFileLabel(photos.length)}
        </strong>
      </div>

      {photos.length > 0 && (
        <>
          <div className="admin-group-toolbar" aria-label="Image groups">
            {groups.map((group) => {
              const count = photosByGroup.get(group.id)?.length ?? 0

              return (
                <button
                  className={group.id === activeGroupId ? 'is-active' : ''}
                  key={group.id}
                  style={{ '--group-color': group.color }}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                >
                  <span className="admin-group-swatch" aria-hidden="true" />
                  {groupLabel(groups, group.id)}
                  <small>{count}</small>
                </button>
              )
            })}
            <button className="admin-button is-secondary" type="button" onClick={createGroup}>
              New group
            </button>
            <button
              className="admin-button is-secondary"
              disabled={!activeGroupId || ungroupedCount === 0}
              type="button"
              onClick={assignUngroupedToActiveGroup}
            >
              Add ungrouped
            </button>
            <button
              className="admin-button is-secondary"
              disabled={!activeGroupId}
              type="button"
              onClick={clearActiveGroup}
            >
              Clear group
            </button>
            <button
              className="admin-text-button is-danger"
              disabled={!activeGroupId}
              type="button"
              onClick={deleteActiveGroup}
            >
              Delete group
            </button>
          </div>

          <div className="admin-gallery-status">
            <span>{groupsWithPhotos.length} group{groupsWithPhotos.length === 1 ? '' : 's'}</span>
            <span>{ungroupedCount} ungrouped</span>
            {preparingPhotoCount > 0 && <span>{preparingPhotoCount} preparing</span>}
            <span>{activeGroup ? `Active: ${groupLabel(groups, activeGroup.id)}` : 'No active group'}</span>
            <div className="admin-gallery-zoom" aria-label="Thumbnail size">
              <button
                aria-label="Zoom thumbnails out"
                disabled={thumbnailScale <= MIN_THUMBNAIL_SCALE}
                title="Zoom out"
                type="button"
                onClick={() => updateThumbnailScale(thumbnailScale - THUMBNAIL_SCALE_STEP)}
              >
                -
              </button>
              <input
                aria-label="Thumbnail size"
                max={MAX_THUMBNAIL_SCALE}
                min={MIN_THUMBNAIL_SCALE}
                step={THUMBNAIL_SCALE_STEP}
                type="range"
                value={thumbnailScale}
                onChange={(event) => updateThumbnailScale(event.target.value)}
              />
              <button
                aria-label="Zoom thumbnails in"
                disabled={thumbnailScale >= MAX_THUMBNAIL_SCALE}
                title="Zoom in"
                type="button"
                onClick={() => updateThumbnailScale(thumbnailScale + THUMBNAIL_SCALE_STEP)}
              >
                +
              </button>
              <output aria-live="polite">{thumbnailScaleLabel}</output>
            </div>
          </div>

          <div
            className="admin-upload-gallery"
            aria-label="Uploaded photos"
          >
            {photos.map((photo) => {
              const photoGroup = groups.find((group) => group.id === photo.groupId)
              const isActiveGroupPhoto = Boolean(photoGroup && photoGroup.id === activeGroupId)
              const previewDimensions = photo.previewDimensions ?? {
                height: DEFAULT_PREVIEW_DIMENSION,
                width: DEFAULT_PREVIEW_DIMENSION,
              }
              const scale = thumbnailScale / 100
              const thumbnailWidth = Math.max(1, Math.round(previewDimensions.width * scale))
              const thumbnailHeight = Math.max(1, Math.round(previewDimensions.height * scale))

              return (
                <div
                  className={`admin-upload-tile${photoGroup ? ' is-grouped' : ''}${isActiveGroupPhoto ? ' is-active' : ''}`}
                  key={photo.id}
                  style={{
                    '--admin-gallery-thumb-height': `${thumbnailHeight}px`,
                    '--admin-gallery-thumb-width': `${thumbnailWidth}px`,
                    '--group-color': photoGroup?.color ?? '#d0d5dd',
                  }}
                >
                  <button
                    aria-pressed={isActiveGroupPhoto}
                    className="admin-upload-select"
                    disabled={photo.isPreparing || Boolean(photo.previewError)}
                    type="button"
                    onClick={(event) => handlePhotoClick(photo, event)}
                    onDoubleClick={() => openPhotoViewer(photo)}
                  >
                    {photo.previewUrl ? (
                      <img alt={photo.file.name} decoding="async" src={photo.previewUrl} />
                    ) : (
                      <span className="admin-photo-preview-placeholder">
                        {photo.previewError ? 'Preview unavailable' : 'Preparing preview'}
                      </span>
                    )}
                    <span className="admin-photo-group-marker">
                      {photoGroup ? groupLabel(groups, photoGroup.id).replace('Group ', '') : '-'}
                    </span>
                    <span className="admin-photo-name">{photo.file.name}</span>
                  </button>
                  <button
                    className="admin-photo-remove"
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>

          {viewingPhoto?.previewUrl && (
            <div className="admin-image-viewer" role="dialog" aria-modal="true" aria-label="Full size image preview">
              <button
                className="admin-image-viewer-backdrop"
                aria-label="Close image preview"
                type="button"
                onClick={() => setViewingPhotoId('')}
              />
              <figure className="admin-image-viewer-content">
                <button
                  className="admin-image-viewer-close"
                  aria-label="Close image preview"
                  type="button"
                  onClick={() => setViewingPhotoId('')}
                >
                  Close
                </button>
                <img alt={viewingPhoto.file.name} decoding="async" src={viewingPhoto.previewUrl} />
                <figcaption>{viewingPhoto.file.name}</figcaption>
              </figure>
            </div>
          )}

          <div className="admin-row admin-workflow-actions">
            <span className="admin-muted">
              {ungroupedCount === 0
                ? 'All grouped photos will become drafts.'
                : `${ungroupedCount} ungrouped photo${ungroupedCount === 1 ? '' : 's'} will be skipped.`}
            </span>
            <button
              className="admin-button"
              type="button"
              onClick={proceedToDetails}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default BulkProductCreator
