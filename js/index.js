function main() {
    let datas
    $.ajax({
        async: false,
        url: "data/20200823-2.json",
        type: "GET",
        dataType: "JSON",
        success: function (data) {
            datas = data
        }
    })

    let graphGenerator = Viva.Graph.generator();
    let graph = graphGenerator.grid();

    var n = 5, m = 25, min = 1,max = 378;
    var nodeColor = 0x009ee8, // 默认颜色
        nodeSize = 12;

    let maxColor = 0xeeeeee;
    let num = datas.maflog[">=0.07"].length;
    let colors = []
    for(let i = 0 ; i < num;i++){
        colors.push(maxColor/num * i);
    }
    let num2 = datas.nodes[0].mafs[2].clade;
    console.log(num2)
    //console.log(colors);

    let layout = Viva.Graph.Layout.forceDirected(graph);

    for (let link of datas.links) {
        graph.addLink(link.from, link.to , link.link_id ,link.link_id)
    }

    var graphics = Viva.Graph.View.webglGraphics()

    var circleNode = buildCircleNodeShader();

    graphics.setNodeProgram(circleNode);

    graphics.node(function (node) {
        return new WebglCircle(nodeSize, nodeColor);
    });



    let renderer = Viva.Graph.View.renderer(graph,
        {
            graphics: graphics,
            layout: layout,
            container: document.getElementById('graph-container')
        })
    let multiSelectOverlay;

    renderer.run()

    var events = Viva.Graph.webglInputEvents(graphics, graph);
    let toast2;
    let toast3;
    let linkNote = null;
    let linkFromX = null;
    let linkFromY = null;

    events
        .mouseEnter(function (node) {
            toast2 = showToast2("node"+node.id,window.event.x,window.event.y);
            // graph.forEachLink(function(link) {
            //     console.log(link);
            //     var linkUI = graphics.getLinkUI(link.id);
            //     // console.log(linkUI);
            // })
        })
            .mouseLeave(function (node) {
                removeToast2(toast2)
                toast2 = null
                if(toast3 !=null){
                    removeToast3(toast3);
                    toast3 =null;
                }
        })
        .dblClick(function (node) {
            let id = parseInt(node.id.slice(4))
            let nodeP = datas.nodes[id-1]
            let info = JSON.stringify(nodeP.virus)
            showToast(info,3000)
        })
        .click(function (node) {
     
            let linkId;
            let linkData;
            let flag = 0;
            if(linkNote == null){
                linkNote = node.links;
                linkFromX = window.event.x;
                linkFromY = window.event.y;

            }else{

                for(let i = 0; i < linkNote.length ; i++){

                    for(let j = 0 ; j < node.links.length ; j++){

                        if(linkNote[i]==node.links[j]){

                            linkId = linkNote[i].id;
                            linkData = linkNote[i].data
                            flag = 1;
                            break;
                        }
                    }
                    if(flag==1){
                        break;
                    }
                }
                linkNote = null;
                if(flag == 1){
                    flag =0;
                    let data = parseInt(linkData.slice(4))
                    let nodeP = datas.links[data-1]
                    toast3 = showToast3(nodeP.diff,(window.event.x + linkFromX)/2,(window.event.y + linkFromY)/2)
                }
            }

    });

    graph.forEachNode(setColor);

    renderer.rerender();

    document.addEventListener('keydown', function (e) {
        if (e.which === 16 && !multiSelectOverlay) { // shift key
            multiSelectOverlay = startMultiSelect(graph, renderer, layout);
        }
    });
    document.addEventListener('keyup', function (e) {
        if (e.which === 16 && multiSelectOverlay) {
            multiSelectOverlay.destroy();
            multiSelectOverlay = null;
        }
    });

    function setColor(node){
        let id = parseInt(node.id.slice(4))
        let nodeP = datas.nodes[id-1]
        let nodeUI = graphics.getNodeUI(node.id);
        //console.log(node);
        nodeUI.color = colors[id%20];
        nodeUI.size = mapSize(nodeP.count);

    }

    function mapSize(count){
        return n+(m-n)*(count-min)/(max-min);
    }
    $('.pause').click(function () {
        renderer.pause()
    });
    $('.continue').click(function () {
        renderer.resume()
    });
}


// 设置为圆形
// Lets start from the easiest part - model object for node ui in webgl
function WebglCircle(size, color) {
    this.size = size;
    this.color = color;
}

function buildCircleNodeShader() {
    // For each primitive we need 4 attributes: x, y, color and size.
    var ATTRIBUTES_PER_PRIMITIVE = 4,
        nodesFS = [
            'precision mediump float;',
            'varying vec4 color;',

            'void main(void) {',
            '   if ((gl_PointCoord.x - 0.5) * (gl_PointCoord.x - 0.5) + (gl_PointCoord.y - 0.5) * (gl_PointCoord.y - 0.5) < 0.25) {',
            '     gl_FragColor = color;',
            '   } else {',
            '     gl_FragColor = vec4(0);',
            '   }',
            '}'].join('\n'),
        nodesVS = [
            'attribute vec2 a_vertexPos;',
            // Pack color and size into vector. First elemnt is color, second - size.
            // Since it's floating point we can only use 24 bit to pack colors...
            // thus alpha channel is dropped, and is always assumed to be 1.
            'attribute vec2 a_customAttributes;',
            'uniform vec2 u_screenSize;',
            'uniform mat4 u_transform;',
            'varying vec4 color;',

            'void main(void) {',
            '   gl_Position = u_transform * vec4(a_vertexPos/u_screenSize, 0, 1);',
            '   gl_PointSize = a_customAttributes[1] * u_transform[0][0];',
            '   float c = a_customAttributes[0];',
            '   color.b = mod(c, 256.0); c = floor(c/256.0);',
            '   color.g = mod(c, 256.0); c = floor(c/256.0);',
            '   color.r = mod(c, 256.0); c = floor(c/256.0); color /= 255.0;',
            '   color.a = 1.0;',
            '}'].join('\n');

    var program,
        gl,
        buffer,
        locations,
        utils,
        nodes = new Float32Array(64),
        nodesCount = 0,
        canvasWidth, canvasHeight, transform,
        isCanvasDirty;

    return {
        /**
         * Called by webgl renderer to load the shader into gl context.
         */
        load : function (glContext) {
            gl = glContext;
            webglUtils = Viva.Graph.webgl(glContext);

            program = webglUtils.createProgram(nodesVS, nodesFS);
            gl.useProgram(program);
            locations = webglUtils.getLocations(program, ['a_vertexPos', 'a_customAttributes', 'u_screenSize', 'u_transform']);

            gl.enableVertexAttribArray(locations.vertexPos);
            gl.enableVertexAttribArray(locations.customAttributes);

            buffer = gl.createBuffer();
        },

        /**
         * Called by webgl renderer to update node position in the buffer array
         *
         * @param nodeUI - data model for the rendered node (WebGLCircle in this case)
         * @param pos - {x, y} coordinates of the node.
         */
        position : function (nodeUI, pos) {
            var idx = nodeUI.id;
            nodes[idx * ATTRIBUTES_PER_PRIMITIVE] = pos.x;
            nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 1] = -pos.y;
            nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 2] = nodeUI.color;
            nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 3] = nodeUI.size;
        },

        /**
         * Request from webgl renderer to actually draw our stuff into the
         * gl context. This is the core of our shader.
         */
        render : function() {
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.DYNAMIC_DRAW);

            if (isCanvasDirty) {
                isCanvasDirty = false;
                gl.uniformMatrix4fv(locations.transform, false, transform);
                gl.uniform2f(locations.screenSize, canvasWidth, canvasHeight);
            }

            gl.vertexAttribPointer(locations.vertexPos, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT, 0);
            gl.vertexAttribPointer(locations.customAttributes, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT, 2 * 4);

            gl.drawArrays(gl.POINTS, 0, nodesCount);
        },

        /**
         * Called by webgl renderer when user scales/pans the canvas with nodes.
         */
        updateTransform : function (newTransform) {
            transform = newTransform;
            isCanvasDirty = true;
        },

        /**
         * Called by webgl renderer when user resizes the canvas with nodes.
         */
        updateSize : function (newCanvasWidth, newCanvasHeight) {
            canvasWidth = newCanvasWidth;
            canvasHeight = newCanvasHeight;
            isCanvasDirty = true;
        },

        /**
         * Called by webgl renderer to notify us that the new node was created in the graph
         */
        createNode : function (node) {
            nodes = webglUtils.extendArray(nodes, nodesCount, ATTRIBUTES_PER_PRIMITIVE);
            nodesCount += 1;
        },

        /**
         * Called by webgl renderer to notify us that the node was removed from the graph
         */
        removeNode : function (node) {
            if (nodesCount > 0) { nodesCount -=1; }

            if (node.id < nodesCount && nodesCount > 0) {
                // we do not really delete anything from the buffer.
                // Instead we swap deleted node with the "last" node in the
                // buffer and decrease marker of the "last" node. Gives nice O(1)
                // performance, but make code slightly harder than it could be:
                webglUtils.copyArrayPart(nodes, node.id*ATTRIBUTES_PER_PRIMITIVE, nodesCount*ATTRIBUTES_PER_PRIMITIVE, ATTRIBUTES_PER_PRIMITIVE);
            }
        },

        /**
         * This method is called by webgl renderer when it changes parts of its
         * buffers. We don't use it here, but it's needed by API (see the comment
         * in the removeNode() method)
         */
        replaceProperties : function(replacedNode, newNode) {},
    };
}

//选中效果
function startMultiSelect(graph, renderer, layout) {
    var graphics = renderer.getGraphics();
    var domOverlay = document.querySelector('.graph-overlay');
    var overlay = createOverlay(domOverlay);
    overlay.onAreaSelected(handleAreaSelected);

    return overlay;

    function handleAreaSelected(area) {
        // For the sake of this demo we are using silly O(n) implementation.
        // Could be improved with spatial indexing if required.
        var topLeft = graphics.transformClientToGraphCoordinates({
            x: area.x,
            y: area.y
        });

        var bottomRight = graphics.transformClientToGraphCoordinates({
            x: area.x + area.width,
            y: area.y + area.height
        });

        graph.forEachNode(higlightIfInside);
        renderer.rerender();

        return;

        function higlightIfInside(node) {
            var nodeUI = graphics.getNodeUI(node.id);
            if (isInside(node.id, topLeft, bottomRight)) {
                nodeUI.color = 0xFFA500ff;  //选中 橙色
                nodeUI.size = 10;
            } else {
                nodeUI.color = 0x009ee8; //未选中 蓝色
                nodeUI.size = 10;
            }
        }

        function isInside(nodeId, topLeft, bottomRight) {
            var nodePos = layout.getNodePosition(nodeId);
            return (topLeft.x < nodePos.x && nodePos.x < bottomRight.x &&
                topLeft.y < nodePos.y && nodePos.y < bottomRight.y);
        }
    }
}

function createOverlay(overlayDom) {
    var selectionClasName = 'graph-selection-indicator';
    var selectionIndicator = overlayDom.querySelector('.' + selectionClasName);
    if (!selectionIndicator) {
        selectionIndicator = document.createElement('div');
        selectionIndicator.className = selectionClasName;
        overlayDom.appendChild(selectionIndicator);
    }

    var notify = [];
    var dragndrop = Viva.Graph.Utils.dragndrop(overlayDom);
    var selectedArea = {
        x: 0,
        y: 0,
        width: 0,
        height: 0
    };
    var startX = 0;
    var startY = 0;

    dragndrop.onStart(function(e) {
        startX = selectedArea.x = e.clientX;
        startY = selectedArea.y = e.clientY;
        selectedArea.width = selectedArea.height = 0;

        updateSelectedAreaIndicator();
        selectionIndicator.style.display = 'block';
    });

    dragndrop.onDrag(function(e) {
        recalculateSelectedArea(e);
        updateSelectedAreaIndicator();
        notifyAreaSelected();
    });

    dragndrop.onStop(function() {
        selectionIndicator.style.display = 'none';
    });

    overlayDom.style.display = 'block';

    return {
        onAreaSelected: function(cb) {
            notify.push(cb);
        },
        destroy: function () {
            overlayDom.style.display = 'none';
            dragndrop.release();
        }
    };

    function notifyAreaSelected() {
        notify.forEach(function(cb) {
            cb(selectedArea);
        });
    }

    function recalculateSelectedArea(e) {
        selectedArea.width = Math.abs(e.clientX - startX);
        selectedArea.height = Math.abs(e.clientY - startY);
        selectedArea.x = Math.min(e.clientX, startX);
        selectedArea.y = Math.min(e.clientY, startY);
    }

    function updateSelectedAreaIndicator() {
        selectionIndicator.style.left = selectedArea.x + 'px';
        selectionIndicator.style.top = selectedArea.y + 'px';
        selectionIndicator.style.width = selectedArea.width + 'px';
        selectionIndicator.style.height = selectedArea.height + 'px';
    }
}



function showToast(msg,duration){
    duration=isNaN(duration)?3000:duration;
    var m = document.createElement('div');
    m.innerHTML = msg;
    m.style.cssText="width:60%; min-width:180px; background:#000; opacity:0.6; height:auto;min-height: 30px; color:#fff; line-height:30px; text-align:center; border-radius:4px; position:fixed; top:60%; left:20%; z-index:999999;";
    document.body.appendChild(m);
    setTimeout(function() {
        var d = 0.5;
        m.style.webkitTransition = '-webkit-transform ' + d + 's ease-in, opacity ' + d + 's ease-in';
        m.style.opacity = '0';
        setTimeout(function() { document.body.removeChild(m) }, d * 1000);
    }, duration);
}

function showToast2(msg,x,y){
    // console.log(x+" "+y)
    var m = document.createElement('div');
    m.innerHTML = msg;
    // m.style.cssText="width:60%; min-width:180px; background:#000; opacity:0.6; height:auto;min-height: 30px; color:#fff; line-height:30px; text-align:center; border-radius:4px; position:fixed; top:60%; left:20%; z-index:999999;";
    m.style.cssText="position: fixed; left:"+x+"px; top:"+y+"px; background:#000; opacity:0.3; color:#fff; line-height:30px; text-align:center; border-radius:4px; z-index:999999;";
    document.body.appendChild(m);
    return m;
}

function removeToast2(m){
    document.body.removeChild(m);
}

function showToast3(msg,x,y){
    // console.log(x+" "+y)
    var m = document.createElement('div');
    m.innerHTML = msg;
    // m.style.cssText="width:60%; min-width:180px; background:#000; opacity:0.6; height:auto;min-height: 30px; color:#fff; line-height:30px; text-align:center; border-radius:4px; position:fixed; top:60%; left:20%; z-index:999999;";
    m.style.cssText="position: fixed; left:"+x+"px; top:"+y+"px; background:#000; opacity:0.6; color:#fff; line-height:30px; text-align:center; border-radius:4px; z-index:999999;";
    document.body.appendChild(m);
    return m;
}
function removeToast3(m){
    document.body.removeChild(m);
}