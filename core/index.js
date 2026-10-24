// NMRemView processing core: public API shared by the web trial and the macOS app.
export { loadFiles, loadExpanded, normalise } from './loader.js';
export { readJcamp } from './jcamp.js';
export { readBruker } from './bruker.js';
export { readVarian } from './varian.js';
export { readText } from './textformats.js';
export { unzip } from './zip.js';
export { createSession, snapToPeak } from './session.js';
export { processDataset, transformFid, defaultProcessing, applyPhase, autoPhase, baselineCorrect, estimateNoise, ppmAxis } from './processing.js';
export { analyse, pickPeaks, findMultiplets, integrateRange, describeMultiplet, normaliseIntegrals } from './analysis.js';
export { suggest, candidateGroups, journalReport, formulaInfo, matchCompounds, fragmentHints } from './assign.js';
export { SHIFT_GROUPS, ELEMENTS, SOLVENTS, IMPURITIES, COUPLINGS, COMPOUNDS, searchReference, findSolvent } from './database.js';
export { POLYMERS, END_GROUPS, degreeOfPolymerisation, composition, microstructure, repeatArea, windowArea } from './polymer.js';
