import { createPhoneView } from './phone-view.js';
import { startPhoneController } from './phone-runtime.js';
startPhoneController({ createView: createPhoneView });
