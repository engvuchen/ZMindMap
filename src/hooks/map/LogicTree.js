/* eslint-disable no-param-reassign */
import { linkHorizontal } from 'd3-shape'

export default class LogicTree {
  constructor(measureSvg) {
    this.measureSvg = measureSvg
    this.defaultWidth = 30
    this.maxWidth = 250
    this.defaultHeight = 40
    this.defaultRootHeight = 60
    this.padding = 10
    this.defaultMarkerHeight = 18
    this.defaultMarkerWidth = 18
    this.markerOverlap = 7
    this.textMarkersGap = 10

    this.gapY = 20
    this.gapX = 40

    this.rectRadius = 5
    this.strokeWidth = 0

    this.bézierCurveGenerator = linkHorizontal()
      .x(d => d.x)
      .y(d => d.y)
  }

  create(root) {
    this.measureWidthAndHeight(root)
    this.calculateXY(root)
    const paths = this.calculatePath(root)
    return {
      paths,
      nodes: root.descendants()
    }
  }

  measureWidthAndHeight(root) {
    // 后续遍历 初步计算 父依赖于子
    root.eachAfter(node => {
      this.measureImageSize(node)
      this.measureTextSize(node)
      this.measureMarkers(node)
      this.measureWH(node)
    })
  }

  measureImageSize(node) {
    const { imgInfo } = node.data
    if (imgInfo) {
      node.iw = imgInfo.width
      node.ih = imgInfo.height
      console.log(node.ih)
    } else {
      node.iw = 0
      node.ih = 0
    }
  }

  measureTextSize(node) {
    if (!this.measureSvg) {
      throw new Error('measureSvg undefined')
    }
    const {
      depth,
      data: { html }
    } = node
    // 根节点字大一点
    const fontSize = depth === 0 ? 16 : 14
    const lineHeight = fontSize + 2
    const t = this.measureSvg.append('text')
    t.selectAll('tspan')
      .data([html])
      .enter()
      .append('tspan')
      .text(d => d)
      .attr('x', 0)
      .attr('style', `font-size:${fontSize}px;line-height:${lineHeight}px;`)
    const { width, height } = t.node().getBBox()
    t.remove()

    if (width < this.maxWidth) {
      node.multiline = [html]
      node.tw = width
      node.th = height
      node.tspanDy = height
      return
    }

    const lines =
      Math.floor(width / this.maxWidth) + (width % this.maxWidth ? 1 : 0)
    const multiline = []
    const lineLength = Math.floor((html.length * this.maxWidth) / width)
    for (let i = 0; i < html.length; i += lineLength) {
      multiline.push(html.substr(i, lineLength))
    }
    node.multiline = multiline
    node.tw = this.maxWidth
    node.th = height * lines
    node.tspanDy = height
  }

  measureMarkers(node) {
    const {
      data: { markerList }
    } = node
    if (!markerList?.length) {
      node.mw = 0
      node.mh = 0
      return
    }
    node.mh = this.defaultMarkerHeight
    const size = markerList.length
    node.mw = this.defaultMarkerWidth * size - this.markerOverlap * (size - 1)
  }

  measureWH(node) {
    node.rectRadius = this.rectRadius
    node.strokeWidth = this.strokeWidth

    node.outLineOffset = 0

    const tmGap = node.mw ? this.textMarkersGap : 0
    const tiGap = node.ih ? this.textMarkersGap : 0
    node.cw = Math.max(
      Math.max(node.tw, node.iw) + node.mw + this.padding * 2 + tmGap,
      this.defaultWidth
    )
    node.ch = Math.max(
      this.padding * 2 + node.ih + tiGap + node.th,
      this.defaultHeight
    )
    const { children } = node
    if (!children) {
      node.w = node.cw
      node.h = node.ch
    } else {
      const maxW = Math.max(...children.map(c => c.w))
      const sumH = children.reduce((p, c) => p + c.h, 0)
      node.h = sumH + this.gapY * (children.length - 1)
      node.w = node.cw + this.gapX + maxW
    }

    node.outLineW = node.cw - node.outLineOffset * 2
    node.outLineH = node.ch - node.outLineOffset * 2
  }

  findRealLastNode(node) {
    const brothers = node.parent.children
    let bro
    // eslint-disable-next-line no-restricted-syntax
    for (const index in brothers) {
      if (node.data.id === brothers[index].data.id) {
        bro = brothers[index - 1]
        break
      }
    }
    return bro
  }

  calculateInnerXY(node) {
    const { mw, th, mh, ch } = node
    node.mx = this.padding
    node.tx = node.mx + mw + (mw ? this.textMarkersGap : 0)
    node.ty = ch - this.padding - th - 4
    node.my = node.ty + th / 2 - mh / 2 + 4

    node.ix = node.tx
    node.iy = this.padding
  }

  calculateXY(root) {
    let lastNode
    // 前序遍历 计算X
    root.eachBefore(node => {
      this.calculateInnerXY(node)
      const { depth } = node
      if (depth === 0) {
        node.x = 140
        lastNode = node
        return
      }
      const { depth: lastDepth, cw, x } = lastNode
      if (depth === lastDepth) {
        node.x = x
      } else if (depth > lastDepth) {
        node.x = x + cw + this.gapX
      } else {
        const bro = this.findLastBrother(node)
        node.x = bro.x
      }
      lastNode = node
    })
    // 后序遍历 计算Y
    lastNode = undefined
    root.eachAfter(node => {
      const { depth } = node
      if (!lastNode) {
        node.y = 100
        lastNode = node
        return
      }
      const { depth: lastDepth, ch, y } = lastNode
      if (depth < lastDepth) {
        const firstChild = node.children[0]
        node.y = firstChild.y + (y - firstChild.y + ch) / 2 - node.ch / 2
      } else {
        const bottom = this.findBottom(lastNode)
        node.y = Math.max(bottom.y + bottom.ch + this.gapY, y + ch + this.gapY)
      }
      lastNode = node
    })
  }

  findBottom(node) {
    let bottom = node
    while (bottom?.children) {
      bottom = bottom.children[bottom.children.length - 1]
    }
    return bottom
  }

  calculatePath(root) {
    const links = root.links()
    const paths = links.map(l => this.getPathData(l))
    return paths
  }

  getPathData(link) {
    const { source, target } = link
    const { x: sx, y: sy, cw, ch: sh, id: sid } = source
    const { x: tx, y: ty, ch, id: tid } = target
    // 生成从一个源点到目标点的光滑的三次贝塞尔曲线
    const bezierLine = this.bézierCurveGenerator({
      source: {
        x: sx + cw,
        y: sy + sh / 2
      },
      target: {
        x: tx,
        y: ty + ch / 2
      }
    })
    return {
      data: bezierLine,
      id: `path-${sid}-${tid}`
    }
  }
}
