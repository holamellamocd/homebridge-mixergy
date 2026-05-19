import type { API } from 'homebridge';
import { MixergyPlatform } from './platform';

export = (api: API): void => {
  api.registerPlatform('homebridge-mixergy', 'Mixergy', MixergyPlatform);
};
