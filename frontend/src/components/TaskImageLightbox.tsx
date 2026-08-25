import Lightbox from "yet-another-react-lightbox"
import Counter from "yet-another-react-lightbox/plugins/counter"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import "yet-another-react-lightbox/plugins/counter.css"
import "yet-another-react-lightbox/styles.css"
import type { TaskAttachment } from "@/lib/tasks"

type TaskImageLightboxProps = {
  images: TaskAttachment[]
  index: number | null
  onClose: () => void
}

export const TaskImageLightbox = ({ images, index, onClose }: TaskImageLightboxProps) => {
  const slides = images.map((image) => ({
    src: image.url,
    alt: image.name,
  }))

  return (
    <Lightbox
      open={index !== null && images.length > 0}
      index={index ?? 0}
      close={onClose}
      slides={slides}
      plugins={images.length > 1 ? [Zoom, Counter] : [Zoom]}
      animation={{ fade: 280, swipe: 280, easing: { fade: "ease-out", swipe: "ease-out", navigation: "ease-out" } }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      carousel={{ finite: images.length < 2, preload: 2 }}
      render={{
        buttonPrev: images.length < 2 ? () => null : undefined,
        buttonNext: images.length < 2 ? () => null : undefined,
      }}
      styles={{
        container: {
          backgroundColor: "rgba(0, 0, 0, 0.94)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        },
      }}
    />
  )
}
