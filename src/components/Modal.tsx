import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  labelledBy: string
  className?: string
  children: ReactNode
  closeLabel?: string
}

export function Modal({ open, onClose, labelledBy, className = '', children, closeLabel = 'Close dialog' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal__sheet">
        <button className="icon-button modal__close" type="button" onClick={onClose} aria-label={closeLabel}>
          <X aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  )
}
