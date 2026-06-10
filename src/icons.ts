import {
  ClarityIcons,
  coreCollectionIcons,
  technologyCollectionIcons,
  socialCollectionIcons,
  mediaCollectionIcons,
  travelCollectionIcons,
  essentialCollectionIcons,
  commerceCollectionIcons,
} from '@cds/core/icon';

// commerce: hat `dollar-bill`, `wallet`, `bank`, `coin-bag`, `euro` etc.
// Ohne diese Collection zeigt Clarity die nicht-registrierten Icons als
// animierten Loading-Placeholder — sah aus als würde Ausgaben ewig laden.
ClarityIcons.addIcons(
  ...coreCollectionIcons,
  ...technologyCollectionIcons,
  ...socialCollectionIcons,
  ...mediaCollectionIcons,
  ...travelCollectionIcons,
  ...essentialCollectionIcons,
  ...commerceCollectionIcons
);
