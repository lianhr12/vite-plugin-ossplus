import path, { resolve } from 'path';
import chalk from 'chalk';
import { map, mergeWith, cloneDeep, isPlainObject, merge } from 'lodash';
import AliOSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import { Buffer } from 'buffer';
import zlib from 'zlib';
import { normalizePath } from 'vite';
import glob from 'glob';
import { readFileSync } from 'fs';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
}

function getTimeStr(d) {
    return "".concat(d.getFullYear(), "-").concat(d.getMonth() + 1, "-").concat(d.getDate(), " ").concat(d.getHours(), ":").concat(d.getMinutes());
}
function getFileContentBuffer(file, gzipFlag) {
    if (!gzipFlag)
        return Promise.resolve(Buffer.from(file.content));
    return new Promise(function (resolve, reject) {
        zlib.gzip(Buffer.from(file.content), {}, function (err, gzipBuffer) {
            if (err)
                reject(err);
            resolve(gzipBuffer);
        });
    });
}
function log() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.log.apply(console, __spreadArray([chalk.bgMagenta('[vite-plugin-ossplus]:')], args, false)); // eslint-disable-line
}
function warn() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.warn.apply(console, __spreadArray([chalk.bgMagenta('[vite-plugin-ossplus]:')], args, false)); // eslint-disable-line
}
var defaultConfig = {
    provider: {},
    retry: 3,
    existCheck: true,
    // prefix 或者 ossBaseDir + project 二选一
    ossBaseDir: 'auto_upload_ci',
    project: '',
    exclude: /.*\.html$/,
    include: /.*/,
    enableLog: false,
    ignoreError: false,
    gzip: true,
};
var red = chalk.red;
var green = chalk.bold.green;
var yellow = chalk.yellow;
var ProviderType;
(function (ProviderType) {
    ProviderType[ProviderType["AliOSS"] = 0] = "AliOSS";
    ProviderType[ProviderType["QCloudOSS"] = 1] = "QCloudOSS";
})(ProviderType || (ProviderType = {}));
var ViteOSSPlusPluginCore = /** @class */ (function () {
    function ViteOSSPlusPluginCore(config) {
        this.config = defaultConfig; // 配置参数
        this.client = {}; // 阿里云OSS客户端
        this.finalPrefix = ''; // 最终计算出来的prefix路径
        this.currentProvider = {}; // 当前提供服务商信息
        // 合并配置信息
        this.config = mergeWith(cloneDeep(this.config), config || {}, function (objVal, srcVal) {
            if (isPlainObject(objVal) && isPlainObject(srcVal)) {
                return merge(objVal, srcVal);
            }
            return srcVal;
        });
        var _a = this.config, retry = _a.retry, provider = _a.provider, ossBaseDir = _a.ossBaseDir, project = _a.project;
        // 容错处理
        if (typeof retry !== 'number' || retry < 0) {
            this.config.retry = 0;
        }
        // 上传OSS的最终路径
        this.finalPrefix = "".concat(ossBaseDir, "/").concat(project);
        this.debug('默认配置:', defaultConfig);
        this.debug('项目配置:', config);
        this.debug('最终使用的配置:', this.config);
        if (typeof provider.aliOSS !== 'undefined') {
            this.currentProvider = provider.aliOSS;
            this.providerType = ProviderType.AliOSS;
            var _b = provider.aliOSS, accessKeyId = _b.accessKeyId, accessKeySecret = _b.accessKeySecret, bucket = _b.bucket, region = _b.region;
            this.client = AliOSS({
                accessKeyId: accessKeyId,
                accessKeySecret: accessKeySecret,
                bucket: bucket,
                region: region,
            });
        }
        else if (typeof provider.qcloudOS !== 'undefined') {
            this.currentProvider = provider.qcloudOS;
            this.providerType = ProviderType.QCloudOSS;
            var _c = provider.qcloudOS, SecretId = _c.SecretId, SecretKey = _c.SecretKey;
            this.client = new COS({
                SecretId: SecretId,
                SecretKey: SecretKey,
            });
        }
    }
    ViteOSSPlusPluginCore.prototype.pickupAssetsFile = function (sourceFiles, outDirPath) {
        var _a, _b;
        var matched = [];
        for (var i = 0; i < sourceFiles.length; i++) {
            var resolveFilePath = sourceFiles[i];
            var fileName = resolveFilePath.split(outDirPath)[1];
            // 排除不符合要求的文件
            if ((_a = this.config.exclude) === null || _a === void 0 ? void 0 : _a.test(fileName)) {
                continue;
            }
            // 查找符合条件的文件
            if ((_b = this.config.include) === null || _b === void 0 ? void 0 : _b.test(fileName)) {
                matched.push({
                    name: fileName,
                    path: resolveFilePath,
                    content: readFileSync(resolveFilePath, { encoding: null }),
                });
            }
        }
        return matched;
    };
    ViteOSSPlusPluginCore.prototype.hanleFilesUpload = function (sourceFiles, outDirPath) {
        var _this_1 = this;
        var files = this.pickupAssetsFile(sourceFiles, outDirPath);
        if (files.length === 0) {
            warn("".concat(yellow('\n 没有找到符合条件的文件上传，请检测配置信息！')));
            return;
        }
        log("".concat(green('\nOSS 上传开始......')));
        this.batchUploadFiles(files)
            .then(function () {
            log("".concat(green('OSS 上传完成\n')));
        })
            .catch(function (err) {
            log("".concat(red('OSS 上传出错'), "::: ").concat(red(err.code), "-").concat(red(err.name), ": ").concat(red(err.message)));
            if (!_this_1.config.ignoreError) {
                throw Error('OSS 上传出错');
            }
        });
    };
    ViteOSSPlusPluginCore.prototype.batchUploadFiles = function (files) {
        var _this_1 = this;
        var i = 1;
        return Promise.all(map(files, function (file) {
            file.$retryTime = 0;
            var uploadName;
            if (path.sep === '/') {
                uploadName = path.join(_this_1.finalPrefix, file.name);
            }
            else {
                // Windows 路径进行处理
                uploadName = path
                    .join(_this_1.finalPrefix, file.name)
                    .split(path.sep)
                    .join('/');
            }
            // 是否检测文件存在，不检测直接上传处理
            if (!_this_1.config.existCheck) {
                return _this_1.uploadFile(file, i++, files, uploadName);
            }
            return _this_1.checkOSSFile(file, i++, files, uploadName);
        }));
    };
    ViteOSSPlusPluginCore.prototype.uploadFile = function (file, idx, files, uploadName) {
        // 上传文件处理
        if (this.providerType === ProviderType.AliOSS) {
            return this.aliUploadFile(file, idx, files, uploadName);
        }
        if (this.providerType === ProviderType.QCloudOSS) {
            return this.qcloudUploadFile(file, idx, files, uploadName);
        }
        return Promise.reject('没有找到上传SDK!');
    };
    ViteOSSPlusPluginCore.prototype.aliUploadFile = function (file, idx, files, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            var fileCount = files.length;
            // 获取文件内容进行压缩处理
            getFileContentBuffer(file, _this_1.config.gzip)
                .then(function (contentBuffer) {
                var opt = _this_1.getOSSUploadOptions();
                var _this = _this_1;
                function _uploadAction() {
                    file.$retryTime++;
                    log("\u5F00\u59CB\u4E0A\u4F20 ".concat(idx, "/").concat(fileCount, ": ").concat(file.$retryTime > 1 ? "\u7B2C".concat(file.$retryTime - 1, "\u6B21\u91CD\u8BD5") : ''), uploadName);
                    _this.client
                        .put(uploadName, contentBuffer, opt)
                        .then(function (response) {
                        log("\u4E0A\u4F20\u6210\u529F ".concat(idx, "/").concat(fileCount, ": ").concat(uploadName));
                        resolve(response);
                    })
                        .catch(function (err) {
                        if (file.$retryTime < _this.config.retry + 1) {
                            _uploadAction();
                        }
                        else {
                            reject(err);
                        }
                    });
                }
                _uploadAction();
            })
                .catch(function (err) {
                reject(err);
            });
        });
    };
    ViteOSSPlusPluginCore.prototype.qcloudUploadFile = function (file, idx, files, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            var fileCount = files.length;
            getFileContentBuffer(file, _this_1.config.gzip)
                .then(function (contentBuffer) {
                var _this = _this_1;
                function _uploadAction() {
                    file.$retryTime++;
                    log("\u5F00\u59CB\u4E0A\u4F20 ".concat(idx, "/").concat(fileCount, ": ").concat(file.$retryTime > 1 ? "\u7B2C".concat(file.$retryTime - 1, "\u6B21\u91CD\u8BD5") : ''), uploadName);
                    _this.client.putObject({
                        Bucket: _this.currentProvider
                            .Bucket /* 填入您自己的存储桶，必须字段 */,
                        Region: _this.currentProvider
                            .Region /* 存储桶所在地域，例如ap-beijing，必须字段 */,
                        Key: uploadName /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段 */,
                        Body: contentBuffer /* 必须 */,
                    }, function (err, data) {
                        if (err) {
                            if (file.$retryTime < _this.config.retry + 1) {
                                _uploadAction();
                            }
                            else {
                                reject(err);
                            }
                        }
                        else {
                            log("\u4E0A\u4F20\u6210\u529F ".concat(idx, "/").concat(fileCount, ": ").concat(uploadName));
                            resolve(data);
                        }
                    });
                }
                _uploadAction();
            })
                .catch(function (err) {
                reject(err);
            });
        });
    };
    ViteOSSPlusPluginCore.prototype.checkOSSFile = function (file, idx, files, uploadName) {
        // 检测OSS是否存在该文件处理
        if (this.providerType === ProviderType.AliOSS) {
            return this.aliCheckOSSFile(file, idx, files, uploadName);
        }
        if (this.providerType === ProviderType.QCloudOSS) {
            return this.qcloudCheckOSSFile(file, idx, files, uploadName);
        }
        return Promise.reject('检测OSS文件失败！');
    };
    ViteOSSPlusPluginCore.prototype.aliCheckOSSFile = function (file, idx, files, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            _this_1.client
                .list({
                'prefix': uploadName,
                'max-keys': 50,
            })
                .then(function (res) {
                var arr = (res.objects || []).filter(function (item) { return item.name === uploadName; });
                if (arr && arr.length > 0) {
                    var timeStr = getTimeStr(new Date(res.objects[0].lastModified));
                    log("".concat(green('已存在,免上传'), " (\u4E0A\u4F20\u4E8E ").concat(timeStr, ") ").concat(idx, "/").concat(files.length, ": ").concat(uploadName));
                    resolve(res);
                }
                else {
                    throw new Error('not exist & need upload');
                }
            })
                .catch(function (err) {
                // 如果获取失败，则处理文件上传
                _this_1.uploadFile(file, idx, files, uploadName)
                    .then(function (uRes) {
                    resolve(uRes);
                })
                    .catch(function (uErr) {
                    reject(uErr);
                });
            });
        });
    };
    ViteOSSPlusPluginCore.prototype.qcloudCheckOSSFile = function (file, idx, files, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            _this_1.client.headObject({
                Bucket: _this_1.currentProvider.Bucket,
                Region: _this_1.currentProvider.Region,
                key: uploadName,
            }, function (err, result) {
                if (result) {
                    log("".concat(green('已存在,免上传'), " ").concat(idx, "/").concat(files.length, ": ").concat(uploadName));
                    resolve(result);
                }
                else {
                    if (err.statusCode == 404) {
                        console.log('对象不存在');
                    }
                    else if (err.statusCode == 403) {
                        console.log('没有该对象读权限');
                    }
                    // 如果获取失败，则处理文件上传
                    _this_1.qcloudUploadFile(file, idx, files, uploadName)
                        .then(function (uRes) {
                        resolve(uRes);
                    })
                        .catch(function (uErr) {
                        reject(uErr);
                    });
                }
            });
        });
    };
    ViteOSSPlusPluginCore.prototype.getOSSUploadOptions = function () {
        var currentOptions = this.currentProvider.options;
        var gzip = this.config.gzip;
        if (gzip) {
            if (currentOptions) {
                currentOptions.headers['Content-Encoding'] = 'gzip';
                return currentOptions;
            }
            return {
                headers: { 'Content-Encoding': 'gzip' },
            };
        }
        return currentOptions || undefined;
    };
    ViteOSSPlusPluginCore.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        this.config.enableLog && log.apply(void 0, args);
    };
    return ViteOSSPlusPluginCore;
}());
function ViteOSSPlusPlugin(options) {
    var buildConfig;
    var client = new ViteOSSPlusPluginCore(options);
    return {
        name: 'vite-plugin-ossplus',
        enforce: 'post',
        apply: 'build',
        configResolved: function (config) {
            buildConfig = config.build;
        },
        closeBundle: function () {
            return __awaiter(this, void 0, void 0, function () {
                var outDirPath, files;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            outDirPath = normalizePath(resolve(normalizePath(buildConfig.outDir)));
                            return [4 /*yield*/, glob.sync("".concat(outDirPath, "/**/*"), {
                                    nodir: true,
                                    dot: true,
                                })];
                        case 1:
                            files = _a.sent();
                            client.hanleFilesUpload(files, outDirPath);
                            return [2 /*return*/];
                    }
                });
            });
        },
    };
}

export { ViteOSSPlusPluginCore, ViteOSSPlusPlugin as default };
