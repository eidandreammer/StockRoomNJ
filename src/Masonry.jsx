import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { gsap } from 'gsap'

import './Masonry.css'

const masonryQueries = [
  '(min-width:1500px)',
  '(min-width:1000px)',
  '(min-width:600px)',
  '(min-width:400px)',
]

const masonryColumns = [5, 4, 3, 2]

const useMedia = (queries, values, defaultValue) => {
  const get = useCallback(() => {
    if (typeof window === 'undefined') {
      return defaultValue
    }

    const index = queries.findIndex((query) => window.matchMedia(query).matches)

    return values[index] ?? defaultValue
  }, [queries, values, defaultValue])

  const [value, setValue] = useState(get)

  useEffect(() => {
    const handler = () => setValue(get)
    const mediaQueries = queries.map((query) => window.matchMedia(query))

    mediaQueries.forEach((query) => query.addEventListener('change', handler))

    return () => {
      mediaQueries.forEach((query) => query.removeEventListener('change', handler))
    }
  }, [get, queries])

  return value
}

const useMeasure = () => {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    if (!ref.current) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })

    observer.observe(ref.current)

    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

const preloadImages = async (urls) => {
  await Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const image = new Image()
          image.src = src
          image.onload = image.onerror = () => resolve()
        }),
    ),
  )
}

const Masonry = ({
  items,
  ease = 'power3.out',
  duration = 0.6,
  stagger = 0.05,
  animateFrom = 'bottom',
  scaleOnHover = true,
  hoverScale = 0.95,
  blurToFocus = true,
  colorShiftOnHover = false,
}) => {
  const columns = useMedia(masonryQueries, masonryColumns, 1)
  const [containerRef, { width }] = useMeasure()
  const [imagesReady, setImagesReady] = useState(false)
  const hasMounted = useRef(false)
  const itemRefs = useRef(new Map())

  const getInitialPosition = useCallback((item) => {
    const containerRect = containerRef.current?.getBoundingClientRect()

    if (!containerRect) {
      return { x: item.x, y: item.y }
    }

    let direction = animateFrom

    if (animateFrom === 'random') {
      const directions = ['top', 'bottom', 'left', 'right']
      direction = directions[Math.floor(Math.random() * directions.length)]
    }

    switch (direction) {
      case 'top':
        return { x: item.x, y: -200 }
      case 'bottom':
        return { x: item.x, y: window.innerHeight + 200 }
      case 'left':
        return { x: -200, y: item.y }
      case 'right':
        return { x: window.innerWidth + 200, y: item.y }
      case 'center':
        return {
          x: containerRect.width / 2 - item.w / 2,
          y: containerRect.height / 2 - item.h / 2,
        }
      default:
        return { x: item.x, y: item.y + 100 }
    }
  }, [animateFrom, containerRef])

  useEffect(() => {
    let isCurrent = true

    preloadImages(items.map((item) => item.img)).then(() => {
      if (isCurrent) {
        setImagesReady(true)
      }
    })

    return () => {
      isCurrent = false
    }
  }, [items])

  const grid = useMemo(() => {
    if (!width) {
      return []
    }

    const columnHeights = new Array(columns).fill(0)
    const columnWidth = width / columns

    return items.map((child) => {
      const column = columnHeights.indexOf(Math.min(...columnHeights))
      const x = columnWidth * column
      const height = child.height / 2
      const y = columnHeights[column]

      columnHeights[column] += height

      return { ...child, x, y, w: columnWidth, h: height }
    })
  }, [columns, items, width])

  const masonryHeight = useMemo(() => {
    if (!grid.length) {
      return 420
    }

    return Math.max(...grid.map((item) => item.y + item.h))
  }, [grid])

  useLayoutEffect(() => {
    if (!imagesReady) {
      return undefined
    }

    const refs = itemRefs.current

    grid.forEach((item, index) => {
      const element = refs.get(item.id)

      if (!element) {
        return
      }

      const animationProps = {
        x: item.x,
        y: item.y,
        width: item.w,
        height: item.h,
      }

      if (!hasMounted.current) {
        const initialPos = getInitialPosition(item)
        const initialState = {
          opacity: 0,
          x: initialPos.x,
          y: initialPos.y,
          width: item.w,
          height: item.h,
          ...(blurToFocus && { filter: 'blur(10px)' }),
        }

        gsap.fromTo(element, initialState, {
          opacity: 1,
          ...animationProps,
          ...(blurToFocus && { filter: 'blur(0px)' }),
          duration: 0.8,
          ease: 'power3.out',
          delay: index * stagger,
        })
      } else {
        gsap.to(element, {
          ...animationProps,
          duration,
          ease,
          overwrite: 'auto',
        })
      }
    })

    hasMounted.current = true

    return () => {
      grid.forEach((item) => {
        const element = refs.get(item.id)

        if (element) {
          gsap.killTweensOf(element)
        }
      })
    }
  }, [
    grid,
    imagesReady,
    stagger,
    animateFrom,
    blurToFocus,
    duration,
    ease,
    getInitialPosition,
  ])

  const handleMouseEnter = (event) => {
    const element = event.currentTarget

    if (scaleOnHover) {
      gsap.to(element, {
        scale: hoverScale,
        duration: 0.3,
        ease: 'power2.out',
      })
    }

    if (colorShiftOnHover) {
      const overlay = element.querySelector('.color-overlay')

      if (overlay) {
        gsap.to(overlay, {
          opacity: 0.3,
          duration: 0.3,
        })
      }
    }
  }

  const handleMouseLeave = (event) => {
    const element = event.currentTarget

    if (scaleOnHover) {
      gsap.to(element, {
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      })
    }

    if (colorShiftOnHover) {
      const overlay = element.querySelector('.color-overlay')

      if (overlay) {
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.3,
        })
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="masonry-list"
      style={{ height: `${masonryHeight}px` }}
    >
      {grid.map((item) => (
        <a
          key={item.id}
          ref={(node) => {
            if (node) {
              itemRefs.current.set(item.id, node)
            } else {
              itemRefs.current.delete(item.id)
            }
          }}
          aria-label={item.alt ?? 'Open gallery image'}
          className="masonry-item-wrapper"
          href={item.url}
          rel="noreferrer"
          target="_blank"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span
            className="masonry-item-img"
            style={{ backgroundImage: `url("${item.img}")` }}
          >
            {colorShiftOnHover && <span className="color-overlay" />}
          </span>
        </a>
      ))}
    </div>
  )
}

export default Masonry
