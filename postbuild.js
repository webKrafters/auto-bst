var fs = require( 'fs' );

const TDEF_FILE_PATH = './dist/index.d.ts';

fs.writeFileSync(
    TDEF_FILE_PATH,
    fs.readFileSync( TDEF_FILE_PATH, 'utf8' )
        .replace( /<T_[0-9]*/g, '<T' )
        .replace( /readonly\s+/g, '' )
        .replace( /\s+constructor:\s+any;/, '' ),
    'utf8'
);
