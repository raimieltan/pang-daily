"""Blender-authored, faceted Lancer pizza remake. Run with Blender --background --python.

The baseline supplies the structural shell, engine and exact modular mating edges.
Coordinates in this builder are the game's glTF frame: X left, Y up, Z forward.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/model'
SOURCE = Path(__file__).parent / 'source/dalagan_modular_baseline.glb'
interfaces=json.loads((OUT/'mounting_interfaces.json').read_text())
def wing_surface(u,v):
    return ((2*u-1)*.719,1.041+.025*abs(2*u-1)**2+.012*math.sin(math.pi*v),-1.79-.235*v-.015*abs(2*u-1))
interfaces['panel_boundary_loops_world']['spoiler_rear_stock']=[
    [wing_surface(i/10,0) for i in range(11)]
    +[wing_surface(1,j/3) for j in range(1,4)]
    +[wing_surface(i/10,1) for i in range(9,-1,-1)]
    +[wing_surface(0,j/3) for j in (2,1)]
]
(OUT/'mounting_interfaces.json').write_text(json.dumps(interfaces,indent=2)+'\n')
if '--interfaces-only' in sys.argv:
    sys.exit(0)
C = lambda p: Vector((p[0], -p[2], p[1]))
G = lambda p: (p[0], p[2], -p[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.view_layer.update()
MATS = {m.name: m for m in bpy.data.materials}
ROOT_NODE = bpy.data.objects['vehicle_root']

def finish_material(name, color, metallic, roughness):
    m = MATS[name]
    m.diffuse_color = (*color, 1)
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness

finish_material('paint', (.205, .235, .225), .3, .42)
finish_material('glass', (.027, .052, .060), .28, .23)
finish_material('rim', (.70, .72, .70), .65, .32)
finish_material('taillight', (.38, .012, .025), .18, .29)
finish_material('headlight', (.57, .64, .62), .25, .26)

class Geometry:
    def __init__(self):
        self.v, self.f, self.materials = [], [], []

    def face(self, points, material='paint'):
        start = len(self.v)
        self.v.extend(points)
        self.f.append(tuple(range(start, start + len(points))))
        self.materials.append(material)

    def solid(self, outline, offset, material='paint'):
        back = [tuple(p[i] + offset[i] for i in range(3)) for p in outline]
        self.face(outline, material)
        self.face(back[::-1], material)
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            self.face([outline[i], back[i], back[j], outline[j]], material)

    def box(self, lo, hi, material='paint'):
        x,y,z = lo; X,Y,Z = hi
        self.solid([(x,y,z),(X,y,z),(X,Y,z),(x,Y,z)], (0,0,Z-z), material)

    def sheet(self, fn, nu, nv, thickness=.012, material='paint'):
        # Closed surface slab, welding gives economical topology on export.
        rows = [[fn(i/nu, j/nv) for j in range(nv+1)] for i in range(nu+1)]
        for i in range(nu):
            for j in range(nv):
                p = [rows[i][j],rows[i+1][j],rows[i+1][j+1],rows[i][j+1]]
                self.face(p, material)
                self.face([(x,y-thickness,z) for x,y,z in p[::-1]], material)
        edge = rows[0] + [r[-1] for r in rows[1:]] + rows[-1][-2::-1] + [r[0] for r in rows[-2:0:-1]]
        for a,b in zip(edge,edge[1:]+edge[:1]):
            self.face([a,b,(b[0],b[1]-thickness,b[2]),(a[0],a[1]-thickness,a[2])],material)

    def ring(self, center, profile, segments, material):
        x,y,z = center
        for i in range(segments):
            a,b = 2*math.pi*i/segments,2*math.pi*(i+1)/segments
            for j in range(len(profile)):
                d,r=profile[j]; D,R=profile[(j+1)%len(profile)]
                self.face([(x+d,y+r*math.cos(a),z+r*math.sin(a)),
                           (x+d,y+r*math.cos(b),z+r*math.sin(b)),
                           (x+D,y+R*math.cos(b),z+R*math.sin(b)),
                           (x+D,y+R*math.cos(a),z+R*math.sin(a))],material)

    def write(self, name, append=False):
        obj = bpy.data.objects.get(name)
        if obj is None:
            obj = bpy.data.objects.new(name, bpy.data.meshes.new(name))
            bpy.context.collection.objects.link(obj)
            obj.parent = ROOT_NODE
        inv = obj.matrix_world.inverted()
        mesh = bpy.data.meshes.new(name+'_pizza')
        mesh.from_pydata([inv@C(v) for v in self.v], [], self.f)
        names = list(dict.fromkeys(self.materials))
        for n in names: mesh.materials.append(MATS[n])
        for p,m in zip(mesh.polygons,self.materials): p.material_index=names.index(m)
        bm = bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh); bm.free()
        if append:
            old = obj.data
            tmp = bpy.data.objects.new('merge_geometry', mesh)
            bpy.context.collection.objects.link(tmp)
            tmp.matrix_world = obj.matrix_world.copy()
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True); tmp.select_set(True)
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.join()
        else:
            obj.data=mesh
        return obj

def remove_upper_cabin():
    obj=bpy.data.objects['shell_base']
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    seen=set();remove=[]
    for v in bm.verts:
        if v in seen:continue
        stack=[v];component=set()
        while stack:
            a=stack.pop()
            if a in component:continue
            component.add(a); stack.extend(e.other_vert(a) for e in a.link_edges)
        seen.update(component)
        if max((obj.matrix_world@v.co).z for v in component)>1.2:
            remove.extend(component)
    bmesh.ops.delete(bm,geom=remove,context='VERTS')
    bm.to_mesh(obj.data);bm.free()

# Replace the block-like greenhouse with a crowned roof, raked screens and broad C-pillars.
remove_upper_cabin()
shell=Geometry()
def roof(u,v):
    x=(u*2-1)*.608; z=.225-v*.87
    y=1.395-.042*(abs(x)/.608)**2-.022*(2*v-1)**2
    return (x,y,z)
shell.sheet(roof,8,6,.018)
for s in (-1,1):
    # A pillar, roof rail, rear sail panel, and sill framing, all part of permanent shell.
    shell.solid([(s*.790,.878,.665),(s*.707,.891,.657),(s*.607,1.351,.225),(s*.645,1.329,.190)],(0,-.016,0))
    shell.solid([(s*.607,1.34,.225),(s*.607,1.34,-.645),(s*.651,1.305,-.660),(s*.648,1.31,.202)],(0,-.020,0))
    shell.solid([(s*.607,1.351,-.645),(s*.651,1.318,-.568),(s*.790,.890,-.912),(s*.790,.875,-1.095),(s*.707,.891,-1.090)],(0,-.016,0))
    shell.solid([(s*.785,.861,.660),(s*.785,.890,.625),(s*.785,.890,-1.09),(s*.785,.861,-1.09)],(-s*.028,0,0))
shell.write('shell_base',append=True)

def screen(name,front):
    # Narrow paint border and rubber gasket enclose curved, opaque tinted glazing.
    geom=Geometry(); glass=Geometry()
    if front:
        lowz,highz,lowy,highy=.657,.225,.891,1.351
    else:
        lowz,highz,lowy,highy=-1.090,-.645,.891,1.351
    def point(u,v):
        x=(2*u-1)*(.707*(1-v)+.607*v)
        z=lowz*(1-v)+highz*v
        y=lowy*(1-v)+highy*v+.018*(1-(2*u-1)**2)
        return x,y,z
    geom.sheet(point,8,4,.012,'paint')
    geom.write('shell_base',append=True)
    def inset(u,v):
        return point(.025+.95*u,.035+.93*v)
    # Offset upward gives glazing a clean, readable edge above the backing surface.
    glass.sheet(lambda u,v: tuple(a+b for a,b in zip(inset(u,v),(0,.003,0))),8,4,.002,'glass')
    glass.write(name)
screen('windshield',True);screen('rear_glass',False)

trim=Geometry()
for s in (-1,1):
    def sidept(z,y,extra=0):
        return (s*(.785-(y-.89)*.315+extra),y,z)
    front=[sidept(.592,.902),sidept(.181,1.313),sidept(-.090,1.321),sidept(-.122,.902)]
    rear=[sidept(-.170,.902),sidept(-.140,1.321),sidept(-.572,1.303),sidept(-.884,.902)]
    for name,pts in [('window_front_'+str(s),front),('window_rear_'+str(s),rear)]:
        g=Geometry();g.solid(pts,(-s*.008,0,0),'glass');g.write(name)
    trim.solid([sidept(-.122,.89,.003),sidept(-.09,1.336,.003),sidept(-.14,1.336,.003),sidept(-.17,.89,.003)],(-s*.018,0,0),'trim')
trim.write('pillar_trim')

# Crown the bonnet and deck without moving a single mating-edge vertex.
for name,z0,z1 in [('hood_stock',.684,1.833),('trunk_stock',-1.934,-1.085)]:
    obj=bpy.data.objects[name]; inv=obj.matrix_world.inverted()
    boundary=[p for loop in interfaces['panel_boundary_loops_world'][name] for p in loop]
    for v in obj.data.vertices:
        p=list(G(obj.matrix_world@v.co)); u=(p[2]-z0)/(z1-z0)
        if any(sum((a-b)**2 for a,b in zip(p,q))<1e-10 for q in boundary):continue
        p[1]+=.028*max(0,1-(p[0]/.677)**2)*max(0,math.sin(math.pi*u))
        v.co=inv@C(p)

# Rounded stock bumper shells reuse the precise upper seam from the modular contract.
for front in (True,False):
    name='bumper_front_stock' if front else 'bumper_rear_stock'
    seam=interfaces['panel_boundary_loops_world'][name][0]
    g=Geometry(); sign=1 if front else -1
    levels=[(.651,1,0),(.575,1.045,.035),(.34,1.05,.050),(.23,1.015,.005),(.205,.98,-.035)]
    rows=[]
    for y,sx,dz in levels:
        rows.append([(x*sx,y,z+sign*dz) for x,_,z in seam])
    for a,b in zip(rows,rows[1:]):
        for i in range(len(seam)-1):g.face([a[i],b[i],b[i+1],a[i+1]])
    # Inside backing, end caps, and top/bottom return flanges leave supports in the shell.
    inner=[(x*.965,y,z-sign*.036) for x,y,z in rows[-1]]
    for a,b in [(rows[-1],inner)]:
        for i in range(len(seam)-1):g.face([a[i],b[i],b[i+1],a[i+1]])
    # Close back and upper ledge as a shell; bumper is a detachable solid component.
    backtop=[(x*.965,y,z-sign*.036) for x,y,z in rows[0]]
    for i in range(len(seam)-1):
        g.face([rows[0][i],rows[0][i+1],backtop[i+1],backtop[i]])
        g.face([backtop[i],backtop[i+1],inner[i+1],inner[i]])
    for side in (0,-1):g.face([r[side] for r in rows]+[inner[side],backtop[side]])
    if front:
        g.solid([(-.43,.30,2.160),(.43,.30,2.160),(.455,.455,2.153),(-.455,.455,2.153)],(0,0,-.013),'trim')
        for x in (-.33,-.165,0,.165,.33):g.box((x-.006,.307,2.162),(x+.006,.442,2.169),'engine_dark')
        g.box((-.205,.474,2.154),(.205,.566,2.170),'trim')
        g.box((-.182,.485,2.172),(.182,.556,2.176),'plate')
        for s in (-1,1):
            # Stock horizontal fog blanks, following the bumper's rounded cheeks.
            g.solid([(s*.51,.325,2.173),(s*.685,.335,2.154),(s*.700,.410,2.151),(s*.515,.407,2.173)],(0,0,-.010),'trim')
            g.solid([(s*.525,.342,2.175),(s*.672,.350,2.160),(s*.674,.365,2.159),(s*.525,.360,2.175)],(0,0,-.006),'engine_dark')
    g.write(name)

# Narrow swept headlights and corner indicators; the nose follows the bonnet down.
g=Geometry()
g.sheet(lambda u,v: ((2*u-1)*.712,.808+.015*(1-(2*u-1)**2)+.002*v,1.833+.195*v-.024*abs(2*u-1)**4),8,2,.022)
for s in (-1,1):
    g.solid([(s*.684,.834,1.824),(s*.784,.831,1.824),(s*.798,.796,1.89),(s*.741,.803,1.999),(s*.709,.807,2.006),(s*.684,.812,1.833)],(0,-.02,0))
g.write('nose_top')
g=Geometry();g.box((-.72,.651,1.835),(.72,.789,1.967))
g.solid([(-.792,.648,1.984),(-.70,.648,2.032),(.70,.648,2.032),(.792,.648,1.984),(.792,.684,1.984),(.70,.684,2.032),(-.70,.684,2.032),(-.792,.684,1.984)],(0,0,-.018))
g.write('nose_carrier')
for s,side in [(1,'l'),(-1,'r')]:
    pts=[(s*.282,.685,2.033),(s*.705,.683,2.013),(s*.731,.792,1.994),(s*.286,.798,2.031)]
    g=Geometry();g.solid(pts,(0,0,-.038),'trim')
    center=tuple(sum(p[i] for p in pts)/4 for i in range(3))
    inset=[tuple(center[i]+.91*(p[i]-center[i])+( .003 if i==2 else 0) for i in range(3)) for p in pts]
    g.solid(inset,(0,0,-.008),'headlight');g.write('headlight_'+side)
    g=Geometry();g.solid([(s*.718,.685,2.011),(s*.796,.683,1.922),(s*.796,.791,1.882),(s*.742,.794,1.982)],(-s*.014,0,-.012),'headlight')
    g.solid([(s*.777,.699,1.960),(s*.799,.699,1.922),(s*.799,.753,1.899),(s*.779,.754,1.940)],(-s*.01,0,-.006),'amber')
    # Oval-like amber side repeaters on the front fender, retained with that fender.
    g.write('indicator_'+str(s))
    repeat=Geometry();repeat.solid([(s*.842,.614,.851),(s*.844,.605,.812),(s*.844,.579,.812),(s*.842,.574,.85),(s*.840,.585,.877),(s*.840,.605,.877)],(-s*.008,0,0),'amber')
    repeat.write('fender_f'+side+'_stock',append=True)
g=Geometry();g.solid([(-.279,.679,2.032),(.279,.679,2.032),(.282,.798,2.032),(-.282,.798,2.032)],(0,0,-.028),'trim');g.write('grille')
g=Geometry()
for y in (.704,.733,.762):g.box((-.26,y,2.034),(.26,y+.009,2.039),'engine_dark')
# Tiny central V grille divider, no logo or badge.
g.solid([(-.08,.795,2.043),(-.01,.684,2.043),(.01,.684,2.043),(.08,.795,2.043),(.055,.795,2.043),(0,.708,2.043),(-.055,.795,2.043)],(0,0,-.012),'paint')
g.write('grille_slats')
g=Geometry()
for s in (-1,1):
    for x in (.36,.47,.58,.66):
        z=2.035-.046*(x-.282)
        g.box((s*x-.0015,.697,z),(s*x+.0015,.782,z+.0015),'reverse')
g.write('headlight_ridges')

# Signature triangular pizza tail lights, with inner trunk section and wraparound corner.
g=Geometry();g.box((-.72,.651,-2.014),(.72,.817,-1.836));g.write('rear_panel')
for s,side in [(1,'l'),(-1,'r')]:
    g=Geometry()
    outline=[(s*.362,.654,-2.034),(s*.780,.654,-2.004),(s*.795,.716,-1.996),(s*.710,.855,-1.980),(s*.636,.866,-1.987)]
    g.solid(outline,(0,0,.026),'trim')
    center=tuple(sum(p[i] for p in outline)/len(outline) for i in range(3))
    inset=[tuple(center[i]+.95*(p[i]-center[i])-(.003 if i==2 else 0) for i in range(3)) for p in outline]
    g.solid(inset,(0,0,.014),'taillight')
    g.solid([(s*.481,.691,-2.030),(s*.751,.687,-2.011),(s*.746,.727,-2.009),(s*.507,.735,-2.028)],(0,0,.006),'reverse')
    g.solid([(s*.632,.659,-2.017),(s*.644,.658,-2.016),(s*.699,.851,-1.990),(s*.691,.853,-1.991)],(0,0,.008),'trim')
    # Side wrap follows the rear quarter instead of a floating rectangular lamp.
    g.solid([(s*.783,.66,-2.000),(s*.823,.666,-1.865),(s*.813,.77,-1.855),(s*.709,.855,-1.979)],(-s*.016,0,.012),'taillight')
    g.write('taillight_'+side)
g=Geometry();g.box((-.27,.665,-2.030),(.27,.805,-2.015),'trim');g.write('rear_plate_recess')
g=Geometry();g.box((-.185,.687,-2.035),(.185,.774,-2.031),'plate');g.write('rear_plate')

# Raised factory wing with swept supports, each foot on the original trunk surface.
g=Geometry()
for s in (-1,1):
    g.solid([(s*.53,.841,-1.79),(s*.57,.832,-1.92),(s*.68,1.034,-1.97),(s*.65,1.05,-1.82)],(s*.042,0,0))
g.sheet(wing_surface,10,3,.027)
g.write('spoiler_rear_stock')

# Five broad spokes and faceted sidewalls match the supplied restored car.
for name in ('wheel_fl','wheel_fr','wheel_rl','wheel_rr'):
    obj=bpy.data.objects[name];center=G(obj.matrix_world.translation);s=1 if center[0]>0 else -1
    g=Geometry()
    g.ring(center,[(-.105,.222),(-.105,.267),(-.085,.294),(-.066,.30),(.066,.30),(.085,.294),(.105,.267),(.105,.222)],24,'tire')
    g.ring(center,[(-.10,.212),(-.10,.228),(.10,.228),(.10,.212)],24,'rim_dark')
    g.ring(center,[(s*.100,.198),(s*.108,.208),(s*.108,.229),(s*.099,.235),(s*.092,.224),(s*.092,.198)],24,'rim')
    g.ring(center,[(s*.06,.035),(s*.102,.035),(s*.102,.069),(s*.06,.069)],12,'rim_dark')
    for i in range(5):
        a=2*math.pi*i/5
        def point(r,t,x):return (center[0]+s*x,center[1]+r*math.cos(a+t),center[2]+r*math.sin(a+t))
        g.solid([point(.055,-.37,.103),point(.211,-.105,.098),point(.215,.105,.098),point(.058,.37,.103)],(-s*.024,0,0),'rim')
    g.ring(center,[(s*.095,.001),(s*.11,.001),(s*.11,.035),(s*.095,.035)],12,'rim_dark')
    g.write(name)

# Preserve origin/parent frames; weld and flat shade all meshes, then export only vehicle nodes.
for obj in bpy.context.scene.objects:
    if obj.type=='MESH':
        for p in obj.data.polygons:p.use_smooth=False
ROOT_NODE['design']='1996 Lancer pizza / faceted reference remake'
ROOT_NODE['seamVersion']=1
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'banwa_dalagan_1996_modular.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'banwa_dalagan_1996_modular.blend'))
print('PIZZA_EXPORT_COMPLETE')

# Re-import the actual delivered GLB for all validation and preview rendering.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'banwa_dalagan_1996_modular.glb'))
bpy.context.view_layer.update()
vehicle=list(bpy.context.scene.objects)
meshes=[o for o in vehicle if o.type=='MESH']
points=[G(o.matrix_world@v.co) for o in meshes for v in o.data.vertices]
report={'generator':'Blender '+bpy.app.version_string,'source':'remake-lancer-pizza.py','triangles':0,'nodes':len(vehicle),'materials':len(bpy.data.materials),'dimensions':[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)],'slots':{},'wheels':{},'zero_area_triangles':0}
report['non_manifold_edges']={}
for o in meshes:
    o.data.calc_loop_triangles();report['triangles']+=len(o.data.loop_triangles)
    report['zero_area_triangles']+=sum(t.area<1e-12 for t in o.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    count=sum(not e.is_manifold for e in bm.edges)
    if count:report['non_manifold_edges'][o.name]=count
    bm.free()
for slot,expected in interfaces['slots'].items():
    parent=bpy.data.objects['attach_'+slot];part=bpy.data.objects[slot+'_stock']
    actual=G(parent.matrix_world.translation)
    assert max(abs(a-b) for a,b in zip(actual,expected))<1e-5,(slot,actual,expected)
    assert part.parent==parent and part.location.length<1e-6,slot
    report['slots'][slot]={'translation':list(actual),'part':part.name,'valid':True}
for name in ('wheel_fl','wheel_fr','wheel_rl','wheel_rr'):
    o=bpy.data.objects[name];pts=[G(o.matrix_world@v.co) for v in o.data.vertices]
    report['wheels'][name]={'origin':list(G(o.matrix_world.translation)),'radius':(max(p[1] for p in pts)-min(p[1] for p in pts))/2}
    assert abs(report['wheels'][name]['radius']-.3)<1e-6
assert report['zero_area_triangles']==0,report['zero_area_triangles']
assert not report['non_manifold_edges'],report['non_manifold_edges']
assert report['triangles']<30000
(OUT/'validation.json').write_text(json.dumps(report,indent=2)+'\n')

scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=760;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.25,.28,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.65
groundmat=bpy.data.materials.new('preview_ground');groundmat.use_nodes=True
groundmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.065,.080,.085,1)
groundmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));floor=bpy.context.object;floor.name='preview_ground';floor.data.materials.append(groundmat)
for location,power,size in [((3,-4,7),1600,5),((-4,-1,4),1100,4),((1,5,5),1900,4)]:
    bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,.6))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=5.6
previews=OUT/'previews';previews.mkdir(exist_ok=True)
def render(name,eye,hidden=(),exploded=False):
    for o in vehicle:o.hide_render=o.name in hidden
    moved=[]
    if exploded:
        for o in vehicle:
            if o.name.startswith('attach_'):
                moved.append((o,o.location.copy()))
                slot=o.name[7:]
                d=(0,.8,0) if slot in ('hood','engine','trunk','spoiler_rear') else ((.7 if o.location.x>=0 else -.7),.15,0)
                if 'bumper' in slot or 'chin' in slot or 'lip' in slot:d=(0,.05,1 if 'front' in slot else -1)
                o.location+=C(d)
    cam.location=C(eye);cam.rotation_euler=(C((0,.65,0))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=7 if exploded else 5.6
    scene.render.filepath=str(previews/(name+'.png'));bpy.ops.render.render(write_still=True)
    for o,p in moved:o.location=p
views=[('01_front_left',(5,3.0,6),()),('02_rear_left',(5,2.8,-6),()),('03_left_side',(7,1.8,0),()),('04_hood_removed',(4,4.5,6),('hood_stock',)),('05_fenders_removed',(5,2.8,6),('fender_fl_stock','fender_fr_stock')),('06_front_bumper_removed',(4,2.3,6),('bumper_front_stock','chin_front_stock','lip_front_stock')),('07_rear_bumper_removed',(4,2.5,-6),('bumper_rear_stock',)),('08_spoiler_removed',(4,3,-6),('spoiler_rear_stock',)),('09_exploded',(5,3.8,6),()),('10_front',(0,1.8,7),()),('11_rear',(0,1.8,-7),())]
if '--quick' in sys.argv:views=views[:2]
for name,eye,hidden in views:render(name,eye,hidden,name=='09_exploded')
print('PIZZA_VALIDATION',json.dumps(report))
