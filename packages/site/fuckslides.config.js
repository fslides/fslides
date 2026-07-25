module.exports = {
  name: 'fslides',
  title: 'fslides — slides are code',
  repo: 'fslides/fslides',                 // comments on the homepage land on the framework repo
  gateway: 'https://api.fslides.dev',
  selection: false,               // website mode: no element selection on the landing deck
  nav: [
    { label: '+ new deck', title: 'create a deck — click a line to copy', menu: [
      { cmd: 'npm install -g fslides' },
      { cmd: 'fslides scaffold my-deck --template charcoal' },
      { cmd: '/plugin marketplace add fslides/fslides' },
    ]},
    { label: 'docs',      href: '/docs/' },
    { label: 'templates', href: '/templates/' },
    { label: '~/decks',   href: '/dashboard/' },
    { label: 'github',    href: 'https://github.com/fslides/fslides' },
  ],
  slidesDir: 'slides',
  port: 3080,

  slides: [
    'cover.html',
    'why.html',
    'features.html',
    'narrate.html',
    'comment.html',
    'start.html',
  ],

  labels: [
    'fslides',
    'Why',
    'Features',
    'Narrate',
    'Comment',
    'Get started',
  ],
};
