(function () {

angular.module( 'InlineTextEditor', ['ngSanitize']);

function inlineTextEditor($sce, $compile, $timeout, $window, $sanitize){
  return {
    restrict: 'A',
    require: '?ngModel',
    link: function($scope, element, attrs, ngModel) {

      var html, savedSelection, clickPosition, overToolbar, originalToolbar, toolbar;

      if (!ngModel) { return; }
      // Specify how UI should be updated
      ngModel.$render = function() {
        element.html(ngModel.$viewValue || '');
      };

      // Write data to the model
      function read() {
        var html = element.html();
        if (html == '<br>') {
          angular.element(element).empty();
          html = '';
        }
        ngModel.$setViewValue(html);
      };

      //This is required if the directive holds any angular expressions (i.e. the ng-click expression on images)
      $timeout(function() {
        $compile(element.contents())($scope);
      },0);

      window.onunload = window.onbeforeunload = (function(){
        return function(){
          // do your thing here...

        }
      }());

      $scope.linkUrl = null;
      $scope.expandLinkInput = false;
      rangy.init();

      originalToolbar = [ '<div contentEditable="false" name="inlineToolbar" class="btn-group" role="group" aria-label="..." style="z-index:9999">',
                            '<button type="button" ng-click="applyClass(\'ite-bold\')" class="btn btn-default btn-sm" data-inline-type="ite-bold" title="bold"><i class="fa fa-bold"></i></button>',
                            '<button type="button" ng-click="applyClass(\'ite-italic\')" class="btn btn-default btn-sm" data-inline-type="ite-italic" title="italic"><i class="fa fa-italic"></i></button>',
                            '<button type="button" ng-click="applyClass(\'ite-underline\')" class="btn btn-default btn-sm" data-inline-type="ite-underline" title="underline"><i class="fa fa-underline"></i></button>',
                            '<button type="button" ng-click="applyClass(\'ite-strikethrough\')" class="btn btn-default btn-sm" data-inline-type="ite-strikethrough" title="strikethrough"><i class="fa fa-strikethrough"></i></button>',

                            '<div class="btn-group ng-hide ng-cloak" ng-show="expandLinkInput">',
                              '<form name="inlineToolbarUrlForm" class="input-group">',
                                '<input id="inline-toolbar-link-url" type="text" url-validator placeholder="add url" ng-model="linkUrl" class="form-control input-sm" required/>',
                              '</form>',
                            '</div>',
                            '<button type="button" ng-click="applyLink()" class="btn btn-default btn-sm" data-inline-type="ite-link" title="add hyperlink"><i class="fa fa-link"></i></button>',
                            '<button type="button" ng-click="resetSelection()" class="btn btn-default btn-sm" title="reset selection"><i class="fa fa-eraser"></i></button>',
                          '</div>'].join('');



      // Update on blur
      element.on('blur', function() {
        $scope.$evalAsync(read);
      });

      // Listen for change events to enable binding
      $scope.$watch(angular.bind(element, function(){
        return element.html();
        }), function() {
          $scope.$evalAsync(read);
      });


      element.on('paste', function() {
        pastedContent = event.clipboardData.getData('text/plain');
        if (event.preventDefault) {
          event.stopPropagation();
          event.preventDefault();
        }
        window.document.execCommand('insertText', false, pastedContent);
      });


      // Create or remove toolbar depending on rangy selection
      element.bind('mouseup', function (e) {
        $scope.$evalAsync(function() {
          clickPosition = { 'x' : e.pageX, 'y' : e.pageY};
          var range = rangy.getSelection();
          var start = range.anchorOffset;
          var end = range.focusOffset;

          if (!range.isCollapsed) {
            createToolbar();
          } else {
            removeToolbar();
          }
        });
      });

      // Remove toolbar if the user clicks outside of the element
      element.bind('blur', function (e) {
        removeToolbar();
      });

      // Bind to escape key and delete key to remove the toolbar
      element.bind("keydown", function (e) {
          if (e.keyCode == 27 || e.keyCode == 8 || e.keyCode == 46) {
            removeToolbar('escape');
          }
      });

      var classFinder = function(node, buttonType) {
        if (angular.element(node).hasClass(buttonType)) {
          return true;
        }
        else if (angular.element(node).attr('inline-text-editor') !== undefined && !angular.element(node).hasClass(buttonType)) {
          return false;
        }
        else {
          return classFinder(node.parentNode, buttonType);
        }
      };

      $scope.applyClass = function(cssClass) {
        // this conditional handles the edge case if the user clicks a class button while having link input open
        if (savedSelection && rangy.getSelection().rangeCount == 0) { rangy.restoreSelection(savedSelection); }
        var classApplierModule = rangy.modules.ClassApplier || rangy.modules.CssClassApplier;
        classApplier = rangy.createClassApplier(cssClass);
        classApplier.toggleSelection();
        setButtonState();
      };

      $scope.resetSelection = function() {
        // Thanks to Tim Down for this code snippet
        var getComputedDisplay = (typeof window.getComputedStyle != "undefined") ?
          function(el) {
            return window.getComputedStyle(el, null).display;
          } :
          function(el) {
            return el.currentStyle.display;
          };

        var replaceWithOwnChildren = function(el) {
          var parent = el.parentNode;
          while (el.hasChildNodes()) {
              parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        }

        var removeSelectionFormatting = function() {
          var sel = rangy.getSelection();

          if (!sel.isCollapsed) {
            for (var i = 0, range; i < sel.rangeCount; ++i) {
              range = sel.getRangeAt(i);

              // Split partially selected nodes
              range.splitBoundaries();

              // Get formatting elements
              var formattingEls = range.getNodes([1], function(el) {
                return el.tagName != "BR" && getComputedDisplay(el) == "inline";
              });

              // Remove the formatting elements
              for (var i = 0, el; el = formattingEls[i++]; ) {
                replaceWithOwnChildren(el);
              }
            }
          }
        }
        removeSelectionFormatting();
      }

      $scope.applyLink = function() {
        // this checks if the user has typed in a link or not
        if ($scope.expandLinkInput) {

          var httpRegex = new RegExp('http(s)?://', 'g', 'i');
          var anchorRegex = /(?:^|\s+)(#\w+)/;
          var linkIsAnchor = $scope.linkUrl.match(anchorRegex);

          if (!linkIsAnchor) {
            $scope.linkUrl = $scope.linkUrl.match(httpRegex) ? $scope.linkUrl : 'http://'+$scope.linkUrl;
          }

          rangy.restoreSelection(savedSelection);

          if (angular.element(rangy.getSelection().focusNode).attr('href')) {
            $scope.linkUrl = $scope.linkUrl.match(httpRegex) ? $scope.linkUrl : 'http://'+$scope.linkUrl;
            angular.element(rangy.getSelection().focusNode).attr('href', $scope.linkUrl);

          } else if($scope.inlineToolbarUrlForm.$valid) {
            if (linkIsAnchor) {
              classApplier = rangy.createClassApplier('ite-link', {elementTagName: 'a', elementAttributes: {'href':$scope.linkUrl}});
            } else {
              classApplier = rangy.createClassApplier('ite-link', {elementTagName: 'a', elementAttributes: {'href':$scope.linkUrl, 'target':'_blank'}});
            }
            classApplier.toggleSelection();
          }
          $scope.linkUrl = '';
        }
        // If the user hasn't entered a link (i.e. they have simply clicked the link button the first time to show the input),
        // then we need to save the selection so we can resore it later since it will be wiped once the link input is focused
        else {
          savedSelection = rangy.saveSelection();
          $scope.linkUrl = linkFinder(rangy.getSelection().focusNode) || '';
        }
        $scope.expandLinkInput = !$scope.expandLinkInput;

        if ($scope.expandLinkInput) {
          $timeout(function() {
            var el = document.getElementById('inline-toolbar-link-url')
            if (el) {
              el.focus();
            }
            angular.element(el).bind('blur', function (e) {
             removeToolbar();
            });
          },0);
        }

        setButtonState();
      };

      var linkFinder = function(node) {
        if (angular.element(node).attr('href')) {
          return angular.element(node).attr('href');
        } else if (angular.element(node).attr('inline-text-editor') !== undefined && !angular.element(node).attr('href')) {
          return false;
        }
        else if (node && node.parentNode) {
          return linkFinder(node.parentNode);
        }
      };


      var createToolbar = function(){
        removeToolbar();
        toolbar = angular.copy(originalToolbar);
        toolbar = $compile(toolbar)($scope);

        angular.element(document.body).after(toolbar);

        toolbar[0].style.position = 'absolute';
        toolbar[0].style.left = clickPosition.x - 50 + 'px';
        toolbar[0].style.top = clickPosition.y + 15 + 'px';

        // Move toolbar to the left if the user clicks at the edge of the screen
        if ((window.outerWidth - clickPosition.x) - angular.element(toolbar).prop('offsetWidth') < 125) {
          toolbar[0].style.left = null;
          toolbar[0].style.right = (window.outerWidth - clickPosition.x) - 50 + 'px';
        }

        angular.element(toolbar).bind('mouseout', function (e) {
          overToolbar = false;
        });
        angular.element(toolbar).bind('mouseover', function (e) {
          overToolbar = true;
        });
        angular.element(document.getElementById('inline-toolbar-link-url')).bind("keydown", function (e) {
          if (e.keyCode == 27) {
            removeToolbar('escape');
          }
        });

        setButtonState();
      };

      var removeToolbar = function(escape){
        if (!overToolbar || (overToolbar && escape)) {
          $scope.expandLinkInput = false;
          angular.element(toolbar).remove();
        }
      };

      var setButtonState = function() {
        var toolbarElements = angular.element(toolbar).children();

        for(i=0; i<toolbarElements.length; i++) {
          var buttonType = angular.element(toolbarElements[i]).attr('data-inline-type');
          if (classFinder(rangy.getSelection().focusNode, buttonType)){
            angular.element(toolbarElements[i]).addClass('active');
          } else {
            angular.element(toolbarElements[i]).removeClass('active');
          }
        }
      };

      var clearSelection = function() {
        // Thanks to Tim Down
        var sel;
        if ( (sel = document.selection) && sel.empty ) {
          sel.empty();
        } else {
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
          var activeEl = document.activeElement;
          if (activeEl) {
            var tagName = activeEl.nodeName.toLowerCase();
            if ( tagName == "textarea" || (tagName == "input" && activeEl.type == "text") ) {
              // Collapse the selection to the end
              activeEl.selectionStart = activeEl.selectionEnd;
            }
          }
        }
      }

    }
  };
}

inlineTextEditor.$inject = ["$sce", "$compile", "$timeout", "$window", "$sanitize"];

function urlValidator() {
  return {
    restrict: 'A',
    require: 'ngModel',
    scope: {
      urlValidator: '=',
      ngModel: '='
    },
    link: function ($scope, element, attrs, ctrl) {
      element.on("keyup", function(event) {
        var urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w\.\-\?\=\&\#\%\(\)\[\]\@\!\$\'\*\+\,\;\:]*)$/i;
        var anchorRegex = /(?:^|\s+)(#\w+)/;
        // Set validity of the field controller
        if ($scope.ngModel && ($scope.ngModel.match(urlRegex) || $scope.ngModel.match(anchorRegex)) ) {
          $scope.$apply(function() {
            ctrl.$setValidity("hyperlink", true);
          });
        } else {
          $scope.$apply(function() {
            ctrl.$setValidity("hyperlink", false);
          });
        }

        if (event.keyCode == 13) {
          $scope.$apply(function() {
            $scope.$parent.applyLink();
          });
        }

      });
    }
  };
}

angular
  .module('InlineTextEditor')
  .directive('inlineTextEditor', inlineTextEditor)
  .directive('urlValidator', urlValidator)
  ;
})();
