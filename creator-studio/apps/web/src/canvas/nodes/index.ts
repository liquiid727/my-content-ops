import type { NodeTypes } from '@xyflow/react'

import { ActionNode } from './action-node'
import { AudioNode } from './audio-node'
import { CollectionNode } from './collection-node'
import { ImageNode } from './image-node'
import { TextNode } from './text-node'
import { VideoNode } from './video-node'

export const canvasNodeTypes: NodeTypes = {
  TextNode,
  ImageNode,
  AudioNode,
  VideoNode,
  CollectionNode,
  ActionNode,
}
