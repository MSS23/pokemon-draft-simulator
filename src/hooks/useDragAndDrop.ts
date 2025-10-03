import { useState, useRef } from 'react'

export interface DragDropItem {
  id: string
  priority: number
  [key: string]: any
}

interface UseDragAndDropOptions<T extends DragDropItem> {
  items: T[]
  onReorder: (reorderedItems: T[]) => void
}

export function useDragAndDrop<T extends DragDropItem>({
  items,
  onReorder
}: UseDragAndDropOptions<T>) {
  const [draggedItem, setDraggedItem] = useState<T | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)

  const handleDragStart = (e: React.DragEvent, item: T, index: number) => {
    setDraggedItem(item)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', item.id)

    // Add some visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null)
    setDragOverIndex(null)
    dragCounter.current = 0

    // Reset visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    dragCounter.current++
    setDragOverIndex(index)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragOverIndex(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()

    if (!draggedItem) return

    const draggedIndex = items.findIndex(item => item.id === draggedItem.id)
    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedItem(null)
      setDragOverIndex(null)
      return
    }

    // Create new array with reordered items
    const newItems = [...items]
    const [removed] = newItems.splice(draggedIndex, 1)
    newItems.splice(targetIndex, 0, removed)

    // Update priorities to match new order
    const reorderedItems = newItems.map((item, index) => ({
      ...item,
      priority: index + 1
    }))

    onReorder(reorderedItems)

    setDraggedItem(null)
    setDragOverIndex(null)
    dragCounter.current = 0
  }

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return

    const newItems = [...items]
    const [removed] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, removed)

    const reorderedItems = newItems.map((item, index) => ({
      ...item,
      priority: index + 1
    }))

    onReorder(reorderedItems)
  }

  const moveUp = (index: number) => {
    if (index > 0) {
      moveItem(index, index - 1)
    }
  }

  const moveDown = (index: number) => {
    if (index < items.length - 1) {
      moveItem(index, index + 1)
    }
  }

  const moveToTop = (index: number) => {
    if (index > 0) {
      moveItem(index, 0)
    }
  }

  const moveToBottom = (index: number) => {
    if (index < items.length - 1) {
      moveItem(index, items.length - 1)
    }
  }

  return {
    draggedItem,
    dragOverIndex,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,
    isDragging: draggedItem !== null
  }
}