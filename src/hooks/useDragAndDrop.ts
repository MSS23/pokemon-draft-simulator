'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'

export { DndContext, SortableContext, verticalListSortingStrategy }

export interface DragDropItem {
  id: string
  priority: number
}

interface UseDragAndDropOptions<T extends DragDropItem> {
  items: T[]
  onReorder: (reorderedItems: T[]) => void
}

/**
 * Hook that wraps @dnd-kit/core and @dnd-kit/sortable for accessible,
 * touch-friendly drag-and-drop reordering.
 *
 * Returns:
 *  - sensors / context props to wire into <DndContext> + <SortableContext>
 *  - activeId / dragOverIndex for visual feedback
 *  - arrow-button helpers (moveUp, moveDown, moveToTop, moveToBottom)
 *  - handleDragStart / handleDragEnd callbacks
 *  - isDragging boolean
 *
 * Backward-compat: draggedItem is still exposed (the full item object).
 */
export function useDragAndDrop<T extends DragDropItem>({
  items,
  onReorder,
}: UseDragAndDropOptions<T>) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // --- Sensors ---------------------------------------------------
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  })

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  })

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })

  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor)

  // --- Item id list for SortableContext --------------------------
  const itemIds = useMemo(() => items.map((i) => i.id), [items])

  // --- Drag callbacks --------------------------------------------
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id)
      const idx = items.findIndex((i) => i.id === event.active.id)
      if (idx !== -1) setDragOverIndex(idx)
    },
    [items],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setDragOverIndex(null)

      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(items, oldIndex, newIndex).map(
        (item, idx) => ({ ...item, priority: idx + 1 }),
      )
      onReorder(reordered)
    },
    [items, onReorder],
  )

  // --- Arrow-button helpers (accessibility) ----------------------
  const moveItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return
      const reordered = arrayMove([...items], fromIndex, toIndex).map(
        (item, idx) => ({ ...item, priority: idx + 1 }),
      )
      onReorder(reordered)
    },
    [items, onReorder],
  )

  const moveUp = useCallback(
    (index: number) => {
      if (index > 0) moveItem(index, index - 1)
    },
    [moveItem],
  )

  const moveDown = useCallback(
    (index: number) => {
      if (index < items.length - 1) moveItem(index, index + 1)
    },
    [moveItem, items.length],
  )

  const moveToTop = useCallback(
    (index: number) => {
      if (index > 0) moveItem(index, 0)
    },
    [moveItem],
  )

  const moveToBottom = useCallback(
    (index: number) => {
      if (index < items.length - 1) moveItem(index, items.length - 1)
    },
    [moveItem, items.length],
  )

  // --- Derived state ---------------------------------------------
  const draggedItem = useMemo(
    () => (activeId ? items.find((i) => i.id === activeId) ?? null : null),
    [activeId, items],
  )

  return {
    // dnd-kit wiring
    sensors,
    itemIds,
    handleDragStart,
    handleDragEnd,
    collisionDetection: closestCenter,

    // Visual feedback
    activeId,
    draggedItem,
    dragOverIndex,
    isDragging: activeId !== null,

    // Accessibility arrow helpers
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,
  }
}

/**
 * Re-export useSortable so consumers don't need a separate import.
 */
export { useSortable, arrayMove }
export type { DragStartEvent, DragEndEvent }
