import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { installChromeMock, resetBrowser } from './chromeMock';

installChromeMock();
beforeEach(() => resetBrowser());
