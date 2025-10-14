const express = require('express');
const formidable = require('formidable');
const fs = require('fs/promises');
const app = express();
const PORT = 3000;

const Timer = require('./Timer');
const CloneDetector = require('./CloneDetector');
const CloneStorage = require('./CloneStorage');
const FileStorage = require('./FileStorage');


// Express and Formidable stuff to receice a file for further processing
// --------------------
const form = formidable({multiples:false});

app.post('/', fileReceiver );
function fileReceiver(req, res, next) {
    form.parse(req, (err, fields, files) => {
        fs.readFile(files.data.filepath, { encoding: 'utf8' })
            .then( data => { return processFile(fields.name, data); });
    });
    return res.end('');
}

app.get('/', viewClones );

app.get('/timers', viewTimers)

const server = app.listen(PORT, () => { console.log('Listening for files on port', PORT); });


// Page generation for viewing current progress
// --------------------
function getStatistics() {
    let cloneStore = CloneStorage.getInstance();
    let fileStore = FileStorage.getInstance();
    let output = 'Processed ' + fileStore.numberOfFiles + ' files containing ' + cloneStore.numberOfClones + ' clones.'
    return output;
}

function lastFileTimersHTML() {
    if (!lastFile) return '';
    output = '<p>Timers for last file processed:</p>\n<ul>\n'
    let timers = Timer.getTimers(lastFile);
    for (t in timers) {
        output += '<li>' + t + ': ' + (timers[t] / (1000n)) + ' µs\n'
    }
    output += '</ul>\n';
    return output;
}

function listClonesHTML() {
    let cloneStore = CloneStorage.getInstance();
    let output = '';

    cloneStore.clones.forEach( clone => {
        output += '<hr>\n';
        output += '<h2>Source File: ' + clone.sourceName + '</h2>\n';
        output += '<p>Starting at line: ' + clone.sourceStart + ' , ending at line: ' + clone.sourceEnd + '</p>\n';
        output += '<ul>';
        clone.targets.forEach( target => {
            output += '<li>Found in ' + target.name + ' starting at line ' + target.startLine + '\n';            
        });
        output += '</ul>\n'
        output += '<h3>Contents:</h3>\n<pre><code>\n';
        output += clone.originalCode;
        output += '</code></pre>\n';
    });

    return output;
}

function listProcessedFilesHTML() {
    let fs = FileStorage.getInstance();
    let output = '<HR>\n<H2>Processed Files</H2>\n'
    output += fs.filenames.reduce( (out, name) => {
        out += '<li>' + name + '\n';
        return out;
    }, '<ul>\n');
    output += '</ul>\n';
    return output;
}

function viewClones(req, res, next) {
    let page='<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector</H1>\n';
    page += '<P>' + getStatistics() + '</P>\n';
    page += lastFileTimersHTML() + '\n';
    page += listClonesHTML() + '\n';
    page += listProcessedFilesHTML() + '\n';
    page += '</BODY></HTML>';
    res.send(page);
}

function calculateAveragesByBlock(data, blockSize=100) {
  const results = [];

  for (let i = 0; i < data.length; i += blockSize) {
    const block = data.slice(i, i + blockSize);

    const { totalSum, matchSum } = block.reduce(
      (acc, item) => {
        acc.totalSum += item.total || 0;
        acc.matchSum += item.match || 0;
        return acc;
      },
      { totalSum: 0, matchSum: 0 }
    );

    const rangeStart = i;
    const rangeEnd = Math.min(i + block.length - 1, data.length - 1);
    const avgTotal = Math.round(totalSum / block.length);
    const avgMatch = Math.round(matchSum / block.length);

    results.push({
      range: `${rangeStart}-${rangeEnd}`,
      avgTotal,
      avgMatch
    });
  }

  return results;
}

function viewTimers(req, res, next) {
    const fileStore = FileStorage.getInstance();
    const files = Array.from(fileStore.getAllFiles());

    if (!files || files.length === 0) {
        return res.send('<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n<BODY><H1>No files have been processed yet.</H1>\n</BODY></HTML>');
    }

    let page=`
        <HTML>
            <HEAD>
                <meta http-equiv="refresh" content="5">
                <TITLE>CodeStream Clone Detector</TITLE>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" 
                rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" 
                crossorigin="anonymous">
                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" 
                integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
            </HEAD>
            <BODY>
                <H1>CodeStream Clode Detector</H1>`;
    let timerStats = [];

    page += `<br><p>Total processed files: ${fileStore.numberOfFiles}</p>`;
    page += `
        <table class="table table-bordered border-primary">
            <caption>Timer Statistics</caption>`;
    page += `
        <thead>
            <tr>
                <th scope="col">#</th>
                <th scope="col">File Name</th>
                <th scope="col">Total Time (µs)</th>
                <th scope="col">Match Time (µs)</th>
            </tr>
        </thead>`;
    page += '<tbody>\n';
    
    files.forEach((file, index) => {
        const timers = Timer.getTimers(file);
        if (!timers) return;
        const total = Number(timers.total / 1000n);
        const match = Number(timers.match / 1000n);

        timerStats.push({ total, match });
        page += `
            <tr>
                <th scope="row">${index + 1}</td>
                <td>${file.name}</td>
                <td>${total}</td>
                <td>${match}</td>
            </tr>`;
    })
    page += '</tbody>';
    page += '</table>';

    page += `<br>
        <div class="container">
            <div class="row">
                <div class="col">
                    <h3>Averages for every 100 files</h2>`
    if (!timerStats || timerStats.length < 100) {
        page += '<p>No averages to calculate for now.</p> </div>';
    }
    else {
        const averages = calculateAveragesByBlock(timerStats, blockSize=100);
        page += `
        <table class="table table-bordered border-primary">
            <thead>
                <tr>
                    <th scope="col">Index Range</th>
                    <th scope="col">Average Total (µs)</th>
                    <th scope="col">Average Match (µs)</th>
                </tr>
            </thead>`;
        averages.forEach(row => {
            page += `
            <tr>
                <th scope="row">${row.range}</td>
                <td>${row.avgTotal}</td>
                <td>${row.avgMatch}</td>
            </tr>`;
    })}
    page += '</table></div>';
    page += `
        <div class="col">
            <h3>Averages for every 1000 files</h2>`;
    if (!timerStats || timerStats.length < 1000) {
        page += '<p>No averages to calculate for now.</p> </div>';
    }
    else {
        const averages = calculateAveragesByBlock(timerStats, blockSize=1000);
        page += `
        <table class="table table-bordered border-primary">
            <thead>
                <tr>
                    <th scope="col">Index Range</th>
                    <th scope="col">Average Total (µs)</th>
                    <th scope="col">Average Match (µs)</th>
                </tr>
            </thead>`;
        averages.forEach(row => {
            page += `
            <tr>
                <th scope="row">${row.range}</td>
                <td>${row.avgTotal}</td>
                <td>${row.avgMatch}</td>
            </tr>`;
    })}
    page += '</table></div></div></div>';

    page += `<p><a href="/">← Back to home page</a></p>`;
    page += '</BODY></HTML>';
    res.send(page);
}

// Some helper functions
// --------------------
// PASS is used to insert functions in a Promise stream and pass on all input parameters untouched.
PASS = fn => d => {
    try {
        fn(d);
        return d;
    } catch (e) {
        throw e;
    }
};

const STATS_FREQ = 100;
const URL = process.env.URL || 'http://localhost:8080/';
var lastFile = null;

function maybePrintStatistics(file, cloneDetector, cloneStore) {
    if (0 == cloneDetector.numberOfProcessedFiles % STATS_FREQ) {
        console.log('Processed', cloneDetector.numberOfProcessedFiles, 'files and found', cloneStore.numberOfClones, 'clones.');
        let timers = Timer.getTimers(file);
        let str = 'Timers for last file processed: ';
        for (t in timers) {
            str += t + ': ' + (timers[t] / (1000n)) + ' µs '
        }
        console.log(str);
        console.log('List of found clones available at', URL);
    }

    return file;
}

// Processing of the file
// --------------------
function processFile(filename, contents) {
    let cd = new CloneDetector();
    let cloneStore = CloneStorage.getInstance();

    return Promise.resolve({name: filename, contents: contents} )
        //.then( PASS( (file) => console.log('Processing file:', file.name) ))
        .then( (file) => Timer.startTimer(file, 'total') )
        .then( (file) => cd.preprocess(file) )
        .then( (file) => cd.transform(file) )

        .then( (file) => Timer.startTimer(file, 'match') )
        .then( (file) => cd.matchDetect(file) )
        .then( (file) => cloneStore.storeClones(file) )
        .then( (file) => Timer.endTimer(file, 'match') )

        .then( (file) => cd.storeFile(file) )
        .then( (file) => Timer.endTimer(file, 'total') )
        .then( PASS( (file) => lastFile = file ))
        .then( PASS( (file) => maybePrintStatistics(file, cd, cloneStore) ))
    // TODO Store the timers from every file (or every 10th file), create a new landing page /timers
    // and display more in depth statistics there. Examples include:
    // average times per file, average times per last 100 files, last 1000 files.
    // Perhaps throw in a graph over all files.
        .catch( console.log );
};

/*
1. Preprocessing: Remove uninteresting code, determine source and comparison units/granularities
2. Transformation: One or more extraction and/or transformation techniques are applied to the preprocessed code to obtain an intermediate representation of the code.
3. Match Detection: Transformed units (and/or metrics for those units) are compared to find similar source units.
4. Formatting: Locations of identified clones in the transformed units are mapped to the original code base by file location and line number.
5. Post-Processing and Filtering: Visualisation of clones and manual analysis to filter out false positives
6. Aggregation: Clone pairs are aggregated to form clone classes or families, in order to reduce the amount of data and facilitate analysis.
*/
