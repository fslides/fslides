#!/usr/bin/env node
'use strict';

const path = require('path');
const fs   = require('fs');

const [,, cmd, ...args] = process.argv;

// Deck manifest: fslides.config.js preferred, fuckslides.config.js legacy.
function resolveConfigPath(cwd) {
  for (const f of ['fslides.config.js', 'fuckslides.config.js']) {
    const p = path.join(cwd, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadConfig(cwd) {
  const cfgPath = resolveConfigPath(cwd);
  if (!cfgPath) {
    console.error('❌  No fslides.config.js found. Run this from a presentation directory.');
    process.exit(1);
  }
  return require(cfgPath);
}

// parse --template flag for add-slide
function getFlag(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

switch (cmd) {
  case 'create':
    require('./create')(args[0], getFlag('--template'), getFlag('--style'));
    break;
  case 'style':
  case 'kit':   // "kit" is the public name for a style package; both commands do the same
    require('./style')(args);
    break;
  case 'import':
    require('./import')(args);
    break;
  case 'pdf':
    require('./pdf')(loadConfig(process.cwd()), { density: getFlag('--density') && +getFlag('--density') });
    break;
  case 'pptx':
    if (args.includes('--editable')) require('./editable').buildEditable(loadConfig(process.cwd()), { density: getFlag('--density') && +getFlag('--density') });
    else require('./pptx')(loadConfig(process.cwd()));
    break;
  case 'gslides': {
    const cfg = loadConfig(process.cwd()), ed = require('./editable');
    ed.buildEditable(cfg, { density: getFlag('--density') && +getFlag('--density'), target: 'gslides' })
      .then(f => args.includes('--no-upload') ? null : ed.uploadToSlides(f, cfg.title || cfg.name || 'presentation'));
    break;
  }
  case 'gif':
    require('./gif')(loadConfig(process.cwd()), args[0]);
    break;
  case 'serve':
    require('./serve')(loadConfig(process.cwd()));
    break;
  case 'hub':
    require('./hub')(args[0]);
    break;
  case 'export': {
    const outArg = args[0] && !args[0].startsWith('-') ? args[0] : undefined;
    require('./export')(loadConfig(process.cwd()), outArg ? path.join(process.cwd(), outArg) : undefined);
    break;
  }
  case 'add-slide':
    require('./add-slide')(args[0], getFlag('--template'));
    break;
  case 'publish':
    require('./publish')(loadConfig(process.cwd()));
    break;
  case 'build':
    require('./build')(loadConfig(process.cwd()), args[0] && !args[0].startsWith('-') ? args[0] : undefined);
    break;
  case 'share':
    require('./share')(args);
    break;
  case 'scaffold':
    require('./scaffold')(args[0], { private: args.includes('--private'), org: getFlag('--org'), template: getFlag('--template'), style: getFlag('--style') });
    break;
  default:
    console.log(`
  fuckSlides — no-bullshit HTML presentations

  Commands:
    fuckslides create <name>          Scaffold a new presentation (--template charcoal|paper, or --style <name>)
    fuckslides kit list|add|use       Reusable design systems (kits): list, install (<path|git-url>), apply to this deck
                                      (fslides style is the same command)
    fuckslides import <file …>        Convert PDF or images to slides (requires ANTHROPIC_API_KEY)
    fuckslides serve                  Open presentation in browser with player
    fuckslides pdf                    Export all slides to PDF (--density 1-5 when the deck uses density)
    fuckslides pptx                   Export all slides to PowerPoint (.pptx)
    fuckslides pptx --editable        Editable PowerPoint: real text boxes, shapes and pictures
    fuckslides gslides                Editable deck, uploaded to Google Drive as Google Slides
                                      (--no-upload to only build the .pptx; --density N)
    fuckslides gif <slide>            Export a slide to animated GIF
    fuckslides export [output.html]   Bundle into a single self-contained HTML file
    fuckslides add-slide <name>       Add a new slide (--template title|stat|quote|split|bullets|cover)
    fuckslides publish                Deploy single-file export to gh-pages branch
    fuckslides build [outDir]         Build a deployable folder (player + slides + assets)
    fuckslides scaffold <name>        Create a GitHub repo for a new deck: files, CI to Pages, comments wired (--private, --org <org>)
    fuckslides hub [path|github-url]  Serve all presentations from a hub manifest
`);
}
