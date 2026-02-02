import { Plugin } from 'obsidian';
import { LuminaView, VIEW_TYPE_LUMINA } from './view';

export default class LuminaPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_LUMINA, (leaf) => new LuminaView(leaf, this));
    this.addRibbonIcon('image', 'Ouvrir Lumina', () => this.activateView());
    this.addCommand({
      id: 'open-lumina',
      name: 'Ouvrir Lumina',
      callback: () => this.activateView(),
    });
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_LUMINA).forEach((leaf) => leaf.detach());
  }

  async activateView() {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_LUMINA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
