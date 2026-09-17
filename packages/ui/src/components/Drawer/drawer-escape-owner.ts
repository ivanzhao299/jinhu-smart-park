interface EscapeOptions {
  closeOnEscape: boolean;
  onClose?: () => void;
}

interface Owner {
  root: HTMLElement;
  options: () => EscapeOptions;
}

const documents = new WeakMap<Document, Owner[]>();

/** One listener chooses one owner, even if closing synchronously unmounts it. */
export function registerDrawerEscapeOwner(root: HTMLElement, options: () => EscapeOptions) {
  const document = root.ownerDocument;
  let owners = documents.get(document);
  if (!owners) {
    owners = [];
    documents.set(document, owners);
    document.addEventListener('keydown', handleEscape);
  }
  const owner = { root, options };
  // React mounts descendant effects first. Place their parent underneath them.
  const descendant = owners.findIndex((entry) => root.contains(entry.root));
  owners.splice(descendant < 0 ? owners.length : descendant, 0, owner);
  return () => {
    const index = owners.indexOf(owner);
    if (index >= 0) owners.splice(index, 1);
    if (owners.length === 0) {
      document.removeEventListener('keydown', handleEscape);
      documents.delete(document);
    }
  };
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const document = event.currentTarget as Document;
  // Native top-layer ownership belongs to the browser, not DOM insertion order.
  if (document.querySelector('dialog:modal')) return;
  const owner = documents.get(document)?.filter((entry) => entry.root.isConnected).at(-1);
  const options = owner?.options();
  // A non-dismissible top drawer still owns Escape; never fall through to a parent.
  if (!options?.closeOnEscape || !options.onClose) return;
  event.preventDefault();
  options.onClose();
}
