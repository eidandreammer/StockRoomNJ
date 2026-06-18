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
import { imageValidationError } from './productImages'
import { shopCategories } from './shopCatalog'

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
  const previewUrlsRef = useRef(new Set())

  useEffect(() => () => {
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl))
    previewUrlsRef.current.clear()
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

  const createGroupRecord = (index) => ({
    color: groupColors[index % groupColors.length],
    id: localId('group'),
  })

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
      const validationError = imageValidationError(file)

      if (validationError) {
        rejectedCount += 1
        firstError ||= validationError
        return
      }

      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.add(previewUrl)
      acceptedPhotos.push({
        file,
        groupId: '',
        id: localId('photo'),
        previewUrl,
      })
    })

    if (acceptedPhotos.length > 0) {
      setPhotos((current) => [...current, ...acceptedPhotos])

      if (groups.length === 0) {
        const group = createGroupRecord(0)
        setGroups([group])
        setActiveGroupId(group.id)
      }
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

    if (photo) {
      URL.revokeObjectURL(photo.previewUrl)
      previewUrlsRef.current.delete(photo.previewUrl)
    }

    setPhotos((current) => current.filter((currentPhoto) => currentPhoto.id !== photoId))
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

    if (ungroupedCount > 0) {
      setError('Assign every uploaded photo to a group before continuing.')
      return
    }

    setGroups(groupsWithPhotos)
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
      setError(saveError.message)
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
                <img
                  alt={`${groupLabel(groupsWithPhotos, activeDraftGroup.id)} primary preview`}
                  decoding="async"
                  loading="lazy"
                  src={activeDraftPhotos[0]?.previewUrl}
                />
              </div>
              <div className="admin-draft-strip" aria-label="Grouped photos">
                {activeDraftPhotos.map((photo) => (
                  <img
                    alt={photo.file.name}
                    decoding="async"
                    key={photo.id}
                    loading="lazy"
                    src={photo.previewUrl}
                  />
                ))}
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
          <input accept="image/*" multiple type="file" onChange={handleFiles} />
        </label>
        <strong>{photoFileLabel(photos.length)}</strong>
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
            <span>{activeGroup ? `Active: ${groupLabel(groups, activeGroup.id)}` : 'No active group'}</span>
          </div>

          <div className="admin-upload-gallery" aria-label="Uploaded photos">
            {photos.map((photo) => {
              const photoGroup = groups.find((group) => group.id === photo.groupId)
              const isActiveGroupPhoto = Boolean(photoGroup && photoGroup.id === activeGroupId)

              return (
                <div
                  className={`admin-upload-tile${photoGroup ? ' is-grouped' : ''}${isActiveGroupPhoto ? ' is-active' : ''}`}
                  key={photo.id}
                  style={{ '--group-color': photoGroup?.color ?? '#d0d5dd' }}
                >
                  <button
                    aria-pressed={isActiveGroupPhoto}
                    className="admin-upload-select"
                    type="button"
                    onClick={() => togglePhotoInActiveGroup(photo)}
                  >
                    <img alt={photo.file.name} decoding="async" loading="lazy" src={photo.previewUrl} />
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

          <div className="admin-row admin-workflow-actions">
            <span className="admin-muted">
              {ungroupedCount === 0
                ? 'All photos are grouped.'
                : `${ungroupedCount} photo${ungroupedCount === 1 ? '' : 's'} still need a group.`}
            </span>
            <button className="admin-button" type="button" onClick={proceedToDetails}>
              Next
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default BulkProductCreator
