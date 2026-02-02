import { ItemView, type WorkspaceLeaf } from 'obsidian';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PhotoGalleryWidget } from './components/PhotoGallery';
import { createBridge } from './services/bridge';
import type LuminaPlugin from './main';

export const VIEW_TYPE_LUMINA = 'lumina-view';

export class LuminaView extends ItemView {
  private root: Root | null = null;
  private plugin: LuminaPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: LuminaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_LUMINA;
  }

  getDisplayText() {
    return 'Lumina';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('lumina-view-container');
    const rootEl = container.createDiv({ cls: 'lumina-view-root' });
    this.root = createRoot(rootEl);
    const api = createBridge(this.plugin);
    this.root.render(React.createElement(PhotoGalleryWidget, { api }));
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}
