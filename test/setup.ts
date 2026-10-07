import { beforeEach } from 'vitest';
import { installChromeMock, resetBrowser } from './chromeMock';

installChromeMock();
beforeEach(() => resetBrowser());
