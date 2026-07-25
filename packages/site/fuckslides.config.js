module.exports = {
  name: 'fslides',
  title: 'fslides — slides are code',
  repo: 'fslides/fslides',                 // comments on the homepage land on the framework repo
  gateway: 'https://api.fslides.dev',
  selection: false,               // website mode: no element selection on the landing deck
  nav: [
    { label: '+ new deck', title: 'nothing → live deck — pick your driver', menu: [
      { cmd: 'curl -fsSL fslides.dev/new | sh -s -- my-deck', note: 'you drive' },
      { cmd: '/plugin marketplace add fslides/fslides', note: 'your agent drives' },
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
