const rp = require('request-promise');
const cheerio = require('cheerio');
const knex = require('./db').knex;

let maxPage = null;
let minPage = 1200;
let getMaxPageTime = null;
let getPictureFromJandanTime = null;
const newImages = [];
const insertDbStatus = [];

const getMaxPage = () => {
  if(maxPage && getMaxPageTime && Date.now() - getMaxPageTime < 10 * 60 * 1000) {
    return Promise.resolve(maxPage);
  }
  return rp({
    uri: 'https://jandan.net/ooxx',
    transform: body => {
      return cheerio.load(body);
    }
  }).then($ => {
    maxPage = +($('.current-comment-page')[0].children[0].data.slice(1, -1));
    getMaxPageTime = Date.now();
    console.log(`最大页数: ${ maxPage }`);
    return maxPage;
  });
};

const getPicture = (maxPage, minPage = 2000) => {
  const page = +Math.random().toString().substr(2) % (maxPage - minPage) + minPage;
  return rp({
    uri: 'https://jandan.net/ooxx/page-' + page,
    transform: body => {
      return cheerio.load(body);
    }
  }).then($ => {
    const length = $('#comments ol li').length;
    const randomNumber = +Math.random().toString().substr(2) % length;
    console.log(`从煎蛋获取图片[${ minPage } < page < ${ maxPage }][${page}, ${randomNumber}]`);
    return $(`#comments ol li`)[randomNumber].children[1].children[1].children[3].children[1].children[2].attribs.src;
  });
};

const filterGif = (url, maxPage, minPage) => {
  if(url.substr(-4).toLowerCase() === '.gif') {
    console.log(`过滤gif图: ${ url }`);
    return getPicture(maxPage, minPage)
    .then(url => {
      return filterGif(url);
    });
  }
  return Promise.resolve(url);
};

const getPictureFromJandan = (limit) => {
  if(insertDbStatus.length >= 100) {
    const successRate = insertDbStatus.filter(f => f === 0).length / insertDbStatus.length;
    console.log(`Rate: ${ successRate }`);
    if(successRate < 0.6) {
      minPage--;
    };
  }
  if(limit && getPictureFromJandanTime && Date.now() - getPictureFromJandanTime < 500) {
    return Promise.resolve();
  }
  getPictureFromJandanTime = Date.now();
  return getMaxPage()
  .then(() => {
    return getPicture(maxPage, minPage);
  }).then(url => {
    return filterGif(url, maxPage, minPage);
  }).then(url => {
    if(insertDbStatus.length > 100) {
      insertDbStatus.splice(0, insertDbStatus.length - 100);
    }
    knex('images').insert({ url }).then(() => {
      if(newImages.length < 50) { newImages.push(url); }
      insertDbStatus.push(0);
    }).catch(() => {
      insertDbStatus.push(1);
    });
    return url;
  });
};

const getPictureAndSave = () => {
  return knex('images').count('url AS count')
  .then(count => {
    console.log(`count: ${ count[0].count }`);
    if(count[0].count < 20) {
      return getPictureFromJandan();
    }
    getPictureFromJandan(true).then();
    if(newImages.length) {
      const url = newImages.splice(0, 1)[0];
      return url;
    }
    return knex('images').orderByRaw('RANDOM()').limit(1)
    .then(success => {
      return success[0].url;
    });
  });
};

setInterval(() => {
  knex('images').count('url AS count')
  .then(count => {
    if(count[0].count < 3500) {
      getPictureFromJandan(true).then();
    }
  });
}, 800);

exports.getPicture = getPictureAndSave;
