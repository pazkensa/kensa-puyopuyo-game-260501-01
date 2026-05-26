// Falling object image sets.
// Files that share the same leading letter before "-" are treated as one erase group.
const IMAGE_MODES = {
  'mode01-standard': {
    label: '標準',
    files: [
      'images/mode01-standard/A-redblood-260424-01.png',
      'images/mode01-standard/B-lymphocyte-260424-01.png',
      'images/mode01-standard/C-whiteblood-260424-01.png',
      'images/mode01-standard/D-badbacteria-260424-01.png',
    ],
  },
  'mode02-kensastudent': {
    label: '検査学生',
    files: [
      'images/mode02-kensastudent/A-myeloblast-01-260430-01.png',
      'images/mode02-kensastudent/A-myeloblast-02-260430-01.png',
      'images/mode02-kensastudent/A-myeloblast-03-260430-01.png',
      'images/mode02-kensastudent/B-meta-myelocyte-01-260430-01.png',
      'images/mode02-kensastudent/B-meta-myelocyte-02-260430-01.png',
      'images/mode02-kensastudent/B-meta-myelocyte-03-260430-01.png',
      'images/mode02-kensastudent/C-segmented-form-01-260430-01.png',
      'images/mode02-kensastudent/C-segmented-form-02-260430-01.png',
      'images/mode02-kensastudent/C-segmented-form-03-260430-01.png',
      'images/mode02-kensastudent/D-poly-erythroblasts01-260527-01.png',
      'images/mode02-kensastudent/D-poly-erythroblasts02-260527-01.png',
      'images/mode02-kensastudent/D-poly-erythroblasts03-260527-01.png',
    ],
  },
};

const DEFAULT_IMAGE_MODE = 'mode01-standard';
let IMAGE_FILES = [...IMAGE_MODES[DEFAULT_IMAGE_MODE].files];
