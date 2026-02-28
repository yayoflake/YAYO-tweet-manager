// server.js
// YAYO tweet manager 로컬 서버
// 사용법: node server.js (또는 start.bat 더블클릭)
//
// [기능]
// 1. 정적 파일 서빙 (프로젝트 폴더 + 상위 data/assets 폴더)
// 2. /api/open-images: data/tweets_media 원본 폴더에서 지정 파일을 선택 상태로 탐색기 열기
// 3. /api/copy-images: 이미지를 고정 임시폴더에 복사 후 탐색기 열기 (50개 초과 대응)
//
// Node.js v6+ 호환 (async/await 미사용)

var http = require('http');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

var PORT = 7890;

// 프로젝트 폴더 (server.js가 위치한 곳)
var PROJECT_DIR = __dirname;
// 상위 폴더 (트위터 백업 폴더: data/, assets/ 존재)
var ARCHIVE_DIR = path.dirname(PROJECT_DIR);

// MIME 타입 매핑
var MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

/**
 * 요청 경로를 실제 파일 시스템 경로로 매핑.
 * - /data/... → ARCHIVE_DIR/data/...
 * - /assets/... → ARCHIVE_DIR/assets/...
 * - 그 외 → PROJECT_DIR/...
 */
function resolveFilePath(urlPath) {
    var decoded = decodeURIComponent(urlPath);

    if (decoded.indexOf('/data/') === 0 || decoded === '/data') {
        return path.join(ARCHIVE_DIR, decoded);
    }
    if (decoded.indexOf('/assets/') === 0 || decoded === '/assets') {
        return path.join(ARCHIVE_DIR, decoded);
    }

    return path.join(PROJECT_DIR, decoded);
}

/**
 * API: /api/open-images
 * POST body: JSON { fnames: ["파일명1.jpg", ...] }
 * 동작: data/tweets_media/ 폴더를 열고, 해당 파일들을 선택 상태로 탐색기에 표시.
 *       임시 .ps1 스크립트(UTF-8 BOM)를 생성하여 SHOpenFolderAndSelectItems를 호출.
 *       한국어 경로 호환을 위해 -EncodedCommand 대신 -File 방식을 사용.
 */
function handleOpenImages(req, res) {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
        try {
            var parsed = JSON.parse(body);
            var fnames = parsed.fnames;
            if (!Array.isArray(fnames) || fnames.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '파일명 목록이 비어있습니다.' }));
                return;
            }

            var srcDir = path.join(ARCHIVE_DIR, 'data', 'tweets_media');

            // 실제 존재하는 파일만 필터링
            var validFiles = [];
            var errors = [];
            fnames.forEach(function (fname) {
                var safeName = path.basename(fname);
                var fullPath = path.join(srcDir, safeName);
                try {
                    fs.statSync(fullPath);
                    validFiles.push(fullPath);
                } catch (e) {
                    errors.push(safeName);
                }
            });

            if (validFiles.length === 0) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '선택 가능한 파일이 없습니다.', errors: errors }));
                return;
            }

            // PowerShell 스크립트 생성: SHOpenFolderAndSelectItems 호출
            // 파일 경로 배열을 PS1에 하드코딩
            var fileArrayLines = validFiles.map(function (f) {
                return "  '" + f.replace(/'/g, "''") + "'";
            }).join(",\n");

            var psScript = [
                '# YAYO tweet manager — 탐색기 선택 열기 (자동 생성, 실행 후 자동 삭제)',
                'Add-Type @"',
                'using System;',
                'using System.Runtime.InteropServices;',
                'using System.Runtime.InteropServices.ComTypes;',
                '',
                'public class ExplorerSelect {',
                '    [DllImport("shell32.dll")]',
                '    public static extern int SHOpenFolderAndSelectItems(',
                '        IntPtr pidlFolder, uint cidl, IntPtr[] apidl, uint dwFlags);',
                '',
                '    [DllImport("shell32.dll")]',
                '    public static extern int SHParseDisplayName(',
                '        [MarshalAs(UnmanagedType.LPWStr)] string pszName,',
                '        IntPtr pbc, out IntPtr ppidl, uint sfgaoIn, out uint psfgaoOut);',
                '',
                '    [DllImport("shell32.dll")]',
                '    public static extern void ILFree(IntPtr pidl);',
                '}',
                '"@',
                '',
                '$folder = "' + srcDir + '"',
                '$files = @(',
                fileArrayLines,
                ')',
                '',
                '# 폴더 PIDL 획득',
                '$folderPidl = [IntPtr]::Zero',
                '$sfgao = 0',
                '[ExplorerSelect]::SHParseDisplayName($folder, [IntPtr]::Zero, [ref]$folderPidl, 0, [ref]$sfgao) | Out-Null',
                '',
                'if ($folderPidl -ne [IntPtr]::Zero) {',
                '    # 각 파일의 PIDL 획득',
                '    $pidls = @()',
                '    foreach ($f in $files) {',
                '        $p = [IntPtr]::Zero',
                '        [ExplorerSelect]::SHParseDisplayName($f, [IntPtr]::Zero, [ref]$p, 0, [ref]$sfgao) | Out-Null',
                '        if ($p -ne [IntPtr]::Zero) { $pidls += $p }',
                '    }',
                '',
                '    if ($pidls.Count -gt 0) {',
                '        [ExplorerSelect]::SHOpenFolderAndSelectItems($folderPidl, $pidls.Count, $pidls, 0) | Out-Null',
                '    }',
                '',
                '    # PIDL 해제',
                '    foreach ($p in $pidls) { [ExplorerSelect]::ILFree($p) }',
                '    [ExplorerSelect]::ILFree($folderPidl)',
                '}',
                '',
                '# 자기 자신 삭제',
                'Remove-Item $MyInvocation.MyCommand.Path -Force'
            ].join('\r\n');

            // 임시 .ps1 파일 기록 (UTF-8 BOM)
            var os = require('os');
            var tmpPs1 = path.join(os.tmpdir(), '_yayo_select_' + Date.now() + '.ps1');
            var bom = new Buffer([0xEF, 0xBB, 0xBF]);
            var content = new Buffer(psScript, 'utf8');
            var buf = Buffer.concat([bom, content]);
            fs.writeFileSync(tmpPs1, buf);

            // PowerShell 실행 (-File 방식으로 한국어 경로 호환)
            exec('powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + tmpPs1 + '"');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                selected: validFiles.length,
                total: fnames.length,
                errors: errors,
                folder: srcDir
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
}

/**
 * API: /api/copy-images
 * POST body: JSON { fnames: ["파일명1.jpg", ...] }
 * 동작: data/tweets_media/ 에서 해당 파일들을 고정 임시폴더(_yayo_upload)에 복사 → 탐색기 열기.
 *       매 호출마다 기존 파일을 삭제하고 새로 복사하므로 임시 폴더가 누적되지 않음.
 */
function handleCopyImages(req, res) {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
        try {
            var parsed = JSON.parse(body);
            var fnames = parsed.fnames;
            if (!Array.isArray(fnames) || fnames.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '파일명 목록이 비어있습니다.' }));
                return;
            }

            var srcDir = path.join(ARCHIVE_DIR, 'data', 'tweets_media');
            var os = require('os');
            var dstDir = path.join(os.tmpdir(), '_yayo_upload');

            // 고정 폴더 초기화: 기존 파일 삭제 후 재생성
            try {
                var existing = fs.readdirSync(dstDir);
                existing.forEach(function (f) {
                    try { fs.unlinkSync(path.join(dstDir, f)); } catch (e) { /* 무시 */ }
                });
            } catch (e) {
                // 폴더가 없으면 생성
                try { fs.mkdirSync(dstDir); } catch (e2) { /* 이미 존재 */ }
            }

            // 파일 복사
            var copied = 0;
            var errors = [];
            fnames.forEach(function (fname) {
                var safeName = path.basename(fname);
                var srcFile = path.join(srcDir, safeName);
                var dstFile = path.join(dstDir, safeName);
                try {
                    var content = fs.readFileSync(srcFile);
                    fs.writeFileSync(dstFile, content);
                    copied++;
                } catch (e) {
                    errors.push(safeName);
                }
            });

            // 탐색기 열기
            exec('explorer "' + dstDir + '"');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                copied: copied,
                total: fnames.length,
                errors: errors,
                folder: dstDir
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
}

/**
 * 정적 파일 서빙
 */
function handleStaticFile(req, res) {
    var urlPath = req.url.split('?')[0]; // 쿼리스트링 제거
    if (urlPath === '/') urlPath = '/index.html';

    var filePath = resolveFilePath(urlPath);

    // 보안: 상위 디렉토리 탈출 방지
    var normalizedPath = path.normalize(filePath);
    if (normalizedPath.indexOf(PROJECT_DIR) !== 0 && normalizedPath.indexOf(ARCHIVE_DIR) !== 0) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, function (err, stats) {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        var ext = path.extname(filePath).toLowerCase();
        var contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
}

// ── 서버 시작 ──────────────────────────────────────────────────────────────────

var server = http.createServer(function (req, res) {
    // CORS 허용 (로컬 개발용)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API 라우팅
    if (req.method === 'POST' && req.url === '/api/open-images') {
        handleOpenImages(req, res);
        return;
    }
    if (req.method === 'POST' && req.url === '/api/copy-images') {
        handleCopyImages(req, res);
        return;
    }

    // 정적 파일
    handleStaticFile(req, res);
});

server.listen(PORT, function () {
    console.log('');
    console.log('  YAYO tweet manager 서버가 시작되었습니다.');
    console.log('  http://localhost:' + PORT);
    console.log('');
    console.log('  이 창을 닫으면 서버가 종료됩니다.');
    console.log('');
});
