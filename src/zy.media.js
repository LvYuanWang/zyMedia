/*
 *
 * zy.media.js
 * HTML5 <video> and <audio> native player
 *
 * Copyright 2016, iReader FE(掌阅书城研发--前端组)
 * License: MIT
 * 
 */
;
(function() {

	var zyMedia = {};


	// Default config
	zyMedia.config = {
		// Overrides the type specified, for dynamic instantiation
		type: '',
		// Set media title
		mediaTitle: '',
		// Force native controls
		nativeControls: false,
		// Autoplay
		autoplay: false,
		// Preload
		preload: 'auto',
		// Video width
		videoWidth: '100%',
		// Video height
		videoHeight: 'auto',
		// Aspect ration 16:9
		aspectRation: (16 / 9),
		// Audio width
		audioWidth: '100%',
		// Audio height
		audioHeight: 44,
		// Rewind to beginning when media ends
		autoRewind: true,
		// Time format to show. Default 1 for 'mm:ss', 2 for 'm:s'
		timeFormatType: 1,
		// Forces the hour marker (##:00:00)
		alwaysShowHours: false,
		// Hide controls when playing and mouse is not over the video
		alwaysShowControls: false,
		// Display the video control
		hideVideoControlsOnLoad: false,
		// Show fullscreen button
		enableFullscreen: true,
		// When this player starts, it will pause other players
		pauseOtherPlayers: true,
		// Media duration
		duration: 0,
		// Sucess callback
		success: null,
		// Error callback
		error: null
	};


	// Feature detect
	(function(t) {
		var ua = window.navigator.userAgent.toLowerCase();
		var v = document.createElement('video');

		t.isiPhone = /iphone/i.test(ua);
		t.isiOS = t.isiPhone || /ipad/i.test(ua);
		t.isAndroid = /android/i.test(ua);
		t.isBustedAndroid = /android 2\.[12]/i.test(ua);
		t.isChrome = /chrome/i.test(ua);
		t.isChromium = /chromium/i.test(ua);
		t.hasTouch = 'ontouchstart' in window;

		t.supportsCanPlayType = typeof v.canPlayType !== 'undefined';

		// Vendor for no controls bar
		t.isVendorControls = /baidu/i.test(ua);
		// Vendor and app for fullscreen button
		t.isVendorFullscreen = /micromessenger|weibo/i.test(ua);
		// Vendor for autoplay be disabled, iOS device and 昂达
		t.isVendorAutoplay = /v819mini/i.test(ua) || t.isiOS;
		// Prefix of current working browser
		t.nativeFullscreenPrefix = (function() {
			if (v.requestFullScreen) {
				return '';
			} else if (v.webkitRequestFullScreen) {
				return 'webkit'
			} else if (v.mozRequestFullScreen) {
				return 'moz'
			} else if (v.msRequestFullScreen) {
				return 'ms'
			}
			return '-'
		})();

		// None-standard
		t.hasOldNativeFullScreen = typeof v.webkitEnterFullscreen !== 'undefined';

		if (t.isChrome) {
			t.hasOldNativeFullScreen = false
		}
		// OS X 10.5 can't do this even if it says it can
		if (t.hasOldNativeFullScreen && /mac os x 10_5/i.test(ua)) {
			t.nativeFullscreenPrefix = '-';
			t.hasOldNativeFullScreen = false
		}
	})(zyMedia.features = {});


	// Get time format
	function timeFormat(time, options) {
		// Video's duration is Infinity in GiONEE(金立) device
		if (!isFinite(time) || time < 0) {
			time = 0;
		}
		// Get hours
		var _time = options.alwaysShowHours ? [0] : [];
		if (Math.floor(time / 3600) % 24) {
			_time.push(Math.floor(time / 3600) % 24)
		}
		// Get minutes
		_time.push(Math.floor(time / 60) % 60);
		// Get seconds
		_time.push(Math.floor(time % 60));
		_time = _time.join(':');
		// Fill '0'
		if (options.timeFormatType == 1) {
			_time = _time.replace(/(:|^)([0-9])(?=:|$)/g, '$10$2')
		}

		return _time
	};

	// Add player ID as an event namespace so it's easier to unbind them later
	function reBuildEvent(event, id) {
		var _event = [];
		event.split(' ').map(function(v) {
			_event.push(v + '.' + id)
		});

		return _event.join(' ')
	}

	// Report whether or not the document in fullscreen mode
	function isInFullScreenMode() {
		return document.fullscreenElement || document.mozFullScreen || document.webkitIsFullScreen
	}

	// Get media type from file extension
	function getTypeFromFileExtension(url) {
		url = url.toLowerCase().split('?')[0];
		var _ext = url.substring(url.lastIndexOf('.') + 1);
		var _av = /mp4|m4v|ogg|ogv|m3u8|webm|webmv|wmv|mpeg|mov/gi.test(_ext) ? 'video/' : 'audio/';

		switch (_ext) {
			case 'mp4':
			case 'm4v':
			case 'm4a':
				return _av + 'mp4';
			case 'webm':
			case 'webma':
			case 'webmv':
				return _av + 'webm';
			case 'ogg':
			case 'oga':
			case 'ogv':
				return _av + 'ogg';
			case 'm3u8':
				return 'application/x-mpegurl';
			case 'ts':
				return _av + 'mp2t';
			default:
				return _av + _ext;
		}
	}

	// Get media type
	function getType(url, type) {
		// If no type is specified, try to get from the extension
		if (url && !type) {
			return getTypeFromFileExtension(url)
		} else {
			// Only return the mime part of the type in case the attribute contains the codec
			// see http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html#the-source-element
			// `video/mp4; codecs="avc1.42E01E, mp4a.40.2"` becomes `video/mp4`
			if (type && ~type.indexOf(';')) {
				return type.substr(0, type.indexOf(';'))
			} else {
				return type
			}
		}
	}

	// Detect if current type is supported  
	function detectType(media, options, src) {
		var mediaFiles = [];
		var i;
		var n;
		var isCanPlay;

		// Get URL and type
		if (options.type) {
			// Accept either string or array of types
			if (typeof options.type == 'string') {
				mediaFiles.push({
					type: options.type,
					url: src
				});
			} else {
				for (i = 0; i < options.type.length; i++) {
					mediaFiles.push({
						type: options.type[i],
						url: src
					});
				}
			}
		} else if (src !== null) {
			// If src attribute
			mediaFiles.push({
				type: getType(src, media.getAttribute('type')),
				url: src
			});
		} else {
			// If <source> elements
			for (i = 0; i < media.childNodes.length; i++) {
				n = media.childNodes[i];

				if (n.nodeType == 1 && n.tagName.toLowerCase() == 'source') {
					src = n.getAttribute('src');
					mediaFiles.push({
						type: getType(src, n.getAttribute('type')),
						url: src
					});
				}
			}
		}

		// For Android which sadly doesn't implement the canPlayType function (always returns '')
		if (zyMedia.features.isBustedAndroid) {
			media.canPlayType = function(type) {
				return /video\/(mp4|m4v)/i.test(type) ? 'maybe' : ''
			};
		}
		// For Chromium to specify natively supported video codecs (i.e. WebM and Theora) 
		if (zyMedia.features.isChromium) {
			media.canPlayType = function(type) {
				return /video\/(webm|ogv|ogg)/i.test(type) ? 'maybe' : ''
			};
		}

		if (zyMedia.features.supportsCanPlayType) {
			for (i = 0; i < mediaFiles.length; i++) {
				// Normal detect
				if (mediaFiles[i].type == "video/m3u8" || media.canPlayType(mediaFiles[i].type).replace(/no/, '') !== ''
					// For Mac/Safari 5.0.3 which answers '' to canPlayType('audio/mp3') but 'maybe' to canPlayType('audio/mpeg')
					|| media.canPlayType(mediaFiles[i].type.replace(/mp3/, 'mpeg')).replace(/no/, '') !== ''
					// For m4a supported by detecting mp4 support
					|| media.canPlayType(mediaFiles[i].type.replace(/m4a/, 'mp4')).replace(/no/, '') !== '') {
					isCanPlay = true;
					break
				}
			}
		}

		return isCanPlay
	};

	// Mediaplayer instance No
	var mpIndex = 0;
	// Store Mediaplayer instance
	zyMedia.players = {};


	// Constructor, MediaPlayer
	zyMedia.MediaPlayer = function(media, option) {
		var t = this;
		var i;

		// Make sure it can't be instantiated again
		if (media.isInstantiated) {
			return
		} else {
			media.isInstantiated = true
		}

		t.$media = $(media);
		t.media = media;

		// Detect video or audio
		var _tagName = t.media.tagName.toLowerCase();
		if (!/audio|video/.test(_tagName)) return;

		t.isVideo = _tagName === 'video';

		// Extend options
		t.options = {};
		for (i in zyMedia.config) {
			t.options[i] = zyMedia.config[i]
		}

		for (i in option) {
			t.options[i] = option[i]
		}
		// Data-config has highest priority
		var config = t.$media.data('config');
		for (i in config) {
			t.options[i] = config[i]
		}

		// Autoplay be disabled
		if (t.options.autoplay) {
			t.options.autoplay = !zyMedia.features.isVendorAutoplay
		}
		// Show controls bar if not video
		if (!t.isVideo) {
			t.options.alwaysShowControls = true
		}

		if (t.options.nativeControls || zyMedia.features.isVendorControls) {
			// Use native controls
			t.$media.attr('controls', 'controls')
		} else {
			var src = t.media.getAttribute('src');
			src = (typeof src == 'undefined' || src === null || src == '') ? null : src;

			if (detectType(t.media, t.options, src)) {
				// Unique ID
				t.id = 'mp_' + mpIndex++;
				zyMedia.players[t.id] = t;

				t.init()
			} else {
				alert('不支持此' + (t.isVideo ? '视' : '音') + '频')
			}
		}
	};


	zyMedia.MediaPlayer.prototype = {

		isControlsVisible: true,
		isFullScreen: false,

		setPlayerSize: function(width, height) {
			var t = this;
			var _W = t.container.width();
			// Container width at most
			if (width > _W) {
				t.width = _W
			}

			// Set height for video
			if (t.isVideo && t.enableAutoSize) {
				var nativeWidth = t.media.videoWidth;
				var nativeHeight = t.media.videoHeight;
				// Uniform scale
				if (nativeWidth && nativeHeight) {
					if (Math.abs(t.options.aspectRation - nativeWidth / nativeHeight) < .1) {
						t.options.aspectRation = nativeWidth / nativeHeight
					}
				}

				t.height = parseInt(_W / t.options.aspectRation)
			}

			t.container.css({
				'width': t.width,
				'height': t.height
			});
			t.$media.height(t.height)
		},

		showControls: function() {
			var t = this;

			if (t.isControlsVisible)
				return;

			t.controls.css('bottom', '0');

			if (t.options.mediaTitle) {
				t.title.css('top', '0')
			}
			// Any additional controls people might add and want to hide
			t.isControlsVisible = true;
		},

		hideControls: function() {
			var t = this;

			if (!t.isControlsVisible || t.options.alwaysShowControls)
				return;

			t.controls.css('bottom', '-45px');

			if (t.options.mediaTitle) {
				t.title.css('top', '-35px')
			}
			// Hide others
			t.isControlsVisible = false
		},

		setControlsTimer: function(timeout) {
			var t = this;
			clearTimeout(t.controlsTimer);

			t.controlsTimer = setTimeout(function() {
				t.hideControls()
			}, timeout);
		},

		updateTimeline: function(e) {
			var t = this;
			var el = (e !== undefined) ? e.target : t.media;
			var percent = null;
			var _W = t.slider.width();

			// Support buffered
			if (el.buffered && el.buffered.length > 0 && el.buffered.end && el.duration) {
				percent = el.buffered.end(el.buffered.length - 1) / el.duration
			}
			// Support bufferedBytes
			else if (el.bytesTotal !== undefined && el.bytesTotal > 0 && el.bufferedBytes !== undefined) {
				percent = el.bufferedBytes / el.bytesTotal
			}
			// Support progressEvent.lengthComputable
			else if (e && e.lengthComputable && e.total !== 0) {
				percent = e.loaded / e.total
			}

			// Update the timeline
			if (percent !== null) {
				percent = Math.min(1, Math.max(0, percent));
				t.loaded.width(_W * percent);
				// Adjust when pause change from playing (魅族)
				t.media.addEventListener('pause', function(e) {
					setTimeout(function() {
						t.loaded.width(_W * percent);
						t.updateTimeline(e)
					}, 300)
				});
			}

			if (t.media.currentTime !== undefined && t.media.duration) {
				// Update bar and handle
				var _w = Math.round(_W * t.media.currentTime / t.media.duration);
				t.current.width(_w);
				t.handle.css('left', _w - Math.round(t.handle.width() / 2))
			}
		},

		updateTime: function() {
			var t = this;
			t.currenttime.html(timeFormat(t.media.currentTime, t.options))

			// Duration is 1 in (读者) device
			if (t.options.duration > 1 || t.media.duration > 1) {
				t.durationD.html(timeFormat(t.options.duration > 1 ? t.options.duration : t.media.duration, t.options))
			}
		},

		enterFullScreen: function() {
			var t = this;
			// Store size
			t.normalHeight = t.container.height();
			t.normalWidth = t.container.width();
			// Set it to not show scroll bars so 100% will work
			$(document.documentElement).addClass('zy_fullscreen');

			// Attempt to do true fullscreen
			if (zyMedia.features.nativeFullscreenPrefix != '-') {
				t.container[0][zyMedia.features.nativeFullscreenPrefix + 'RequestFullScreen']()
			} else if (zyMedia.features.hasOldNativeFullScreen) {
				t.media.webkitEnterFullscreen();
				return
			}

			// Make full size
			t.container.css({
				width: '100%',
				height: '100%'
			});
			t.$media.css({
				width: '100%',
				height: '100%'
			});
			t.fullscreenBtn.addClass('zy_unfullscreen');
			t.isFullScreen = true
		},

		exitFullScreen: function() {
			var t = this;
			// Come out of native fullscreen
			if (isInFullScreenMode() || t.isFullScreen) {
				if (zyMedia.features.nativeFullscreenPrefix != '-') {
					document[zyMedia.features.nativeFullscreenPrefix + 'CancelFullScreen']()
				} else if (zyMedia.features.hasOldNativeFullScreen) {
					document.webkitExitFullscreen()
				}
			}

			$(document.documentElement).removeClass('zy_fullscreen');
			t.container.css({
				width: t.normalWidth,
				height: t.normalHeight
			});
			t.$media.css({
				width: t.normalWidth,
				height: t.normalHeight
			});
			t.fullscreenBtn.removeClass('zy_unfullscreen');
			t.isFullScreen = false
		},

		// Media container
		buildContainer: function() {
			var t = this;

			t.container = t.$media.parent().css('overflow', 'hidden');
			// Preset container's height on aspectRation
			t.container
				.css('height', t.isVideo ? t.container.width() / t.options.aspectRation : t.options.audioHeight)
				.html('<div class="zy_wrap"></div><div class="zy_controls"></div>');

			if (t.options.mediaTitle) {
				t.title = $('<div class="zy_title">' + t.options.mediaTitle + '</div>').appendTo(t.container)
			}

			t.$media.attr('preload', t.options.preload);
			t.container.find('.zy_wrap').append(t.$media);
			t.controls = t.container.find('.zy_controls');

			if (t.isVideo) {
				t.width = t.options.videoWidth;
				t.height = t.options.videoHeight;

				if (t.width == '100%' && t.height == 'auto') {
					t.enableAutoSize = true
				}
				t.setPlayerSize(t.width, t.height)
			}
		},

		// Play/pause button
		buildPlaypause: function() {
			var t = this;
			var play =
				$('<div class="zy_playpause_btn zy_play" ></div>')
				.appendTo(t.controls)
				.click(function(e) {
					t.media.isUserClick = true;

					if (t.media.paused) {
						t.media.play();
						// Controls bar auto hide after 3s
						if (!t.media.paused && !t.options.alwaysShowControls) {
							t.setControlsTimer(3000)
						}
					} else {
						t.media.pause()
					}
				});

			function togglePlayPause(s) {
				if (t.media.isUserClick || t.options.autoplay) {
					if ('play' === s) {
						play.removeClass('zy_play').addClass('zy_pause')
					} else {
						play.removeClass('zy_pause').addClass('zy_play')
					}
				}
			};

			t.media.addEventListener('play', function() {
				togglePlayPause('play')
			}, false);

			t.media.addEventListener('playing', function() {
				togglePlayPause('play')
			}, false);

			t.media.addEventListener('pause', function() {
				togglePlayPause('pse')
			}, false);

			t.media.addEventListener('paused', function() {
				togglePlayPause('pse')
			}, false);
		},

		// Timeline
		buildTimeline: function() {
			var t = this;

			$('<div class="zy_timeline">' +
					'<div class="zy_timeline_slider">' +
					'<div class="zy_timeline_buffering" style="display:none"></div>' +
					'<div class="zy_timeline_loaded"></div>' +
					'<div class="zy_timeline_current"></div>' +
					'<div class="zy_timeline_handle"></div>' +
					'</div>' +
					'</div>')
				.appendTo(t.controls);

			t.slider = t.controls.find('.zy_timeline_slider');
			t.loaded = t.controls.find('.zy_timeline_loaded');
			t.current = t.controls.find('.zy_timeline_current');
			t.handle = t.controls.find('.zy_timeline_handle');
			t.buffering = t.controls.find('.zy_timeline_buffering');

			var isPointerDown = false;
			var _X = t.slider.offset().left;
			var _W = t.slider.width();

			var pointerMove = function(e) {
				var _time = 0;
				var x;

				if (e.changedTouches) {
					x = e.changedTouches[0].pageX
				} else {
					x = e.pageX
				}

				if (t.media.duration) {
					if (x < _X) {
						x = _X
					} else if (x > _W + _X) {
						x = _W + _X
					}

					_time = ((x - _X) / _W) * t.media.duration;
					// Seek to where the pointer is
					if (isPointerDown && _time !== t.media.currentTime) {
						t.media.currentTime = _time
					}
				}
			};

			// Handle clicks
			t.slider
				.on('mousedown touchstart', function(e) {
					isPointerDown = true;
					pointerMove(e);
					_X = t.slider.offset().left;
					_W = t.slider.width();
					t.globalBind('mousemove.dur touchmove.dur', function(e) {
						pointerMove(e)
					});
					t.globalBind('mouseup.dur touchend.dur', function(e) {
						isPointerDown = false;
						t.globalUnbind('.dur')
					});
				})
				.on('mouseenter', function(e) {
					t.globalBind('mousemove.dur', function(e) {
						pointerMove(e)
					});
				})
				.on('mouseleave', function(e) {
					if (!isPointerDown) {
						t.globalUnbind('.dur');
					}
				});

			t.media.addEventListener('progress', function(e) {
				t.updateTimeline(e)
			}, false);

			//4Hz ~ 66Hz, no longer than 250ms
			t.media.addEventListener('timeupdate', function(e) {
				t.updateTimeline(e)
			}, false);
		},

		// Current and duration time 00:00/00:00
		buildTime: function() {
			var t = this;

			$('<div class="zy_time">' +
					'<span class="zy_currenttime">' +
					timeFormat(0, t.options) +
					'</span>/' +
					'<span class="zy_duration">' +
					timeFormat(t.options.duration, t.options) +
					'</span>' +
					'</div>')
				.appendTo(t.controls);

			t.currenttime = t.controls.find('.zy_currenttime');
			t.durationD = t.controls.find('.zy_duration');

			//4Hz ~ 66Hz, no longer than 250ms
			t.media.addEventListener('timeupdate', function() {
				t.updateTime()
			}, false);
		},

		// Fullscreen button
		buildFullscreen: function() {
			var t = this;
			// Native events
			if (zyMedia.features.nativeFullscreenPrefix != '-') {
				// Chrome doesn't alays fire this in an iframe
				var func = function(e) {
					if (t.isFullScreen) {
						if (!isInFullScreenMode()) {
							t.exitFullScreen()
						}
					}
				};

				t.globalBind(zyMedia.features.nativeFullscreenPrefix + 'fullscreenchange', func)
			}

			t.fullscreenBtn = $('<div class="zy_fullscreen_btn"></div>').appendTo(t.controls);

			t.fullscreenBtn.click(function() {
				if ((zyMedia.features.nativeFullscreenPrefix != '-' && isInFullScreenMode()) || t.isFullScreen) {
					t.exitFullScreen()
				} else {
					t.enterFullScreen()
				}
			});
		},

		// bigPlay, loading and error info
		buildDec: function() {
			var t = this;
			var loading = $('<div class="dec_loading"></div>')
				.hide() // Start out hidden
				.appendTo(t.container);
			var error = $('<div class="dec_error">播放异常</div>')
				.hide() // Start out hidden
				.appendTo(t.container);
			// This needs to come last so it's on top
			var bigPlay = $();

			if (!zyMedia.features.isiPhone) {
				bigPlay = $('<div class="dec_play"></div>')
					.appendTo(t.container)
					.on('click', function() {
						// For some device trigger 'play' event 
						t.media.isUserClick = true;

						if (t.media.paused) {
							t.media.play();
							// Controls bar auto hide after 3s
							if (!t.media.paused && !t.options.alwaysShowControls) {
								t.setControlsTimer(3000)
							}
						}
					});
			}

			// Show/hide big play button
			t.media.addEventListener('play', function() {
				if (t.media.isUserClick) {
					bigPlay.hide();
					loading.show();
					t.buffering.hide();
					error.hide()
				}
			}, false);

			t.media.addEventListener('playing', function() {
				bigPlay.hide();
				loading.hide();
				t.buffering.hide();
				error.hide();
			}, false);

			t.media.addEventListener('seeking', function() {
				loading.show();
				bigPlay.hide();
				t.buffering.show();
			}, false);

			t.media.addEventListener('seeked', function() {
				loading.hide();
				t.buffering.hide();
			}, false);

			t.media.addEventListener('pause', function() {
				if (!zyMedia.features.isiPhone) {
					bigPlay.show();
				}
			}, false);

			t.media.addEventListener('waiting', function() {
				loading.show();
				bigPlay.hide();
				t.buffering.show();
			}, false);

			// Don't listen to 'loadeddata' and 'canplay', 
			// some Android device can't fire 'canplay' or irregular working when use 'createEvent' to trigger 'canplay' (读者i800)

			// Error handling
			t.media.addEventListener('error', function(e) {
				loading.hide();
				bigPlay.show();
				t.media.pause();
				error.show();
				t.buffering.hide();

				if (typeof t.options.error == 'function') {
					t.options.error(e);
				}
			}, false);
		},

		globalBind: function(event, callback) {
			$(document).on(reBuildEvent(event, this.id), callback)
		},

		globalUnbind: function(event, callback) {
			$(document).off(reBuildEvent(event, this.id), callback)
		},

		init: function() {
			var t = this;

			// Build
			var batch = ['Container', 'Playpause', 'Timeline', 'Time'];
			if (t.options.enableFullscreen && !zyMedia.features.isVendorFullscreen && t.isVideo) {
				batch.push('Fullscreen')
			}

			if (t.isVideo) {
				batch.push('Dec')
			}

			for (var i = 0; i < batch.length; i++) {
				try {
					t['build' + batch[i]]()
				} catch (exp) {}
			}

			// Controls fade
			if (t.isVideo) {
				if (zyMedia.features.hasTouch) {
					t.media.addEventListener('click', function() {
						// Toggle controls
						if (t.isControlsVisible) {
							t.hideControls()
						} else {
							t.showControls();
							// Controls bar auto hide after 3s
							if (!t.media.paused && !t.options.alwaysShowControls) {
								t.setControlsTimer(3000)
							}
						}
					}, false);
				} else {
					// Click to play/pause
					t.media.addEventListener('click', function() {
						if (t.media.paused) {
							t.media.play()
						} else {
							t.media.pause()
						}
					}, false);

					// Show/hide controls
					t.container
						.on('mouseenter', function() {
							t.showControls();

							if (!t.options.alwaysShowControls) {
								t.setControlsTimer(3000)
							}
						})
						.on('mousemove', function() {
							t.showControls();

							if (!t.options.alwaysShowControls) {
								t.setControlsTimer(3000)
							}
						})
						.on('mouseleave', function() {
							if (!t.media.paused && !t.options.alwaysShowControls) {
								t.setControlsTimer(3000)
							}
						});
				}

				if (t.options.hideVideoControlsOnLoad) {
					t.hideControls()
				}

				t.media.addEventListener('loadedmetadata', function(e) {
					if (t.enableAutoSize) {
						// For more properly videoWidth or videoHeight of HM 1SW(小米), QQ browser is 0
						setTimeout(function() {
							if (!isNaN(t.media.videoHeight)) {
								t.setPlayerSize()
							}
						}, 50)
					}
				}, false);

				t.media.addEventListener('play', function() {
					var p;

					for (var i in zyMedia.players) {
						p = zyMedia.players[i];

						if (p.id != t.id && t.options.pauseOtherPlayers && !p.paused && !p.ended) {
							try {
								p.media.pause()
							} catch (exp) {}
						}
					}
				}, false);

			}

			// Adjust controls when orientation change, 500ms for Sumsung tablet
			window.addEventListener('orientationchange', function() {
				setTimeout(function() {
					t.setPlayerSize()
				}, 500)
			});

			// Ended for all
			t.media.addEventListener('ended', function(e) {
				if (t.options.autoRewind) {
					try {
						t.media.currentTime = 0;
						// Fixing an Android stock browser bug, where "seeked" isn't fired correctly after ending the video and jumping to the beginning
						setTimeout(function() {
							$(t.container).find('.dec_loading').hide()
						}, 20);
					} catch (exp) {}
				}

				t.media.pause();
				t.updateTimeline(e)
			}, false);

			t.media.addEventListener('loadedmetadata', function(e) {
				t.updateTime()
			}, false);

			// Force autoplay for HTML5
			if (t.options.autoplay) {
				t.media.isUserClick = false;
				t.media.play()
			}

			if (typeof t.options.success == 'function') {
				t.options.success(t.media)
			}
		}

	};


	$.fn.mediaplayer = function(options) {
		this.each(function() {
			new zyMedia.MediaPlayer(this, options)
		});
		return this
	};


})()